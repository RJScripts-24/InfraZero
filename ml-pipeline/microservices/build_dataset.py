"""Turn raw Alibaba call traces into a compact, labelled architecture dataset.

The raw traces are ~12 GB of gzipped CSV holding hundreds of millions of
individual RPC calls. This module streams them once and emits a few hundred
megabytes of labelled architectures, after which the raw traces can be deleted.

Pipeline
--------
1. Stream each tarball's CSV without ever materialising it in memory. Rows are
   grouped into call graphs by ``traceid`` using a sliding window -- measured
   trace locality is p99.9 < 25k rows, so a 600k-row window reassembles
   essentially every trace intact while holding only ~13k live traces.

2. Reconstruct each trace as a directed graph of microservices, assigning every
   node a role from how it is called (``db`` -> database, ``mc`` -> cache, ...).

3. Collapse traces onto their *structure* with a Weisfeiler-Lehman hash over
   role-labelled nodes and kind-labelled edges. Every trace that realises the
   same topology lands in the same bucket.

   This is the pivotal decision. The model only ever sees structure, so pooling
   the label over structure makes the target the conditional expectation given
   the model's own inputs. Bucketing by concrete service identity instead would
   hand the model two identical inputs carrying different labels, capping
   achievable accuracy for reasons no architecture change could fix.

4. Accumulate each bucket's observed end-to-end latency into a fixed-size
   log-spaced histogram -- bounded memory, mergeable across shards, and accurate
   enough for the p99 that the label is cut from.

The label is derived purely from measured response time, which is never an input
feature. Structure predicts latency; latency is not fed back in.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import os
import shutil
import sys
import tarfile
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

from .config import (
    ARCH_SHARDS_DIR,
    DATASET_DIR,
    DATASET_FILE,
    DATASET_STATS_FILE,
    EXTRACT_SCRATCH_DIR,
    MAX_NODES_PER_ARCH,
    MIN_NODES_PER_ARCH,
    MIN_TRACE_INSTANCES,
    RAW_V2021_DIR,
    RAW_V2022_DIR,
)
from .features import role_from_rpctype

csv.field_size_limit(10_000_000)

# --------------------------------------------------------------------------- #
# Tunables
# --------------------------------------------------------------------------- #

# Rows of lookback before a trace is considered complete and flushed.
TRACE_WINDOW_ROWS = 600_000
FLUSH_EVERY_ROWS = 100_000

# Log-spaced latency histogram: 0.1 ms .. 100 s across 128 buckets.
HIST_BINS = 128
HIST_MIN_MS = 0.1
HIST_MAX_MS = 100_000.0
_LOG_MIN = math.log(HIST_MIN_MS)
_LOG_MAX = math.log(HIST_MAX_MS)
_LOG_SPAN = _LOG_MAX - _LOG_MIN

# Weisfeiler-Lehman refinement rounds used to canonicalise a topology.
WL_ITERATIONS = 3

# Placeholders the Alibaba README calls out as lost/unavailable service names.
MISSING_NAMES = {"", "nan", "(?)", "?", "unknown", "unavailable", "none", "null"}


def _hist_bin(latency_ms: float) -> int:
    """Map a latency in milliseconds onto a log-spaced bucket index."""

    if latency_ms <= HIST_MIN_MS:
        return 0
    if latency_ms >= HIST_MAX_MS:
        return HIST_BINS - 1
    position = (math.log(latency_ms) - _LOG_MIN) / _LOG_SPAN
    return min(HIST_BINS - 1, max(0, int(position * HIST_BINS)))


def _bin_centre_ms(index: int) -> float:
    """Representative latency for a bucket, used when reading quantiles back."""

    return math.exp(_LOG_MIN + (index + 0.5) / HIST_BINS * _LOG_SPAN)


def histogram_quantile(histogram: Dict[int, int], quantile: float) -> float:
    """Read a quantile out of a sparse log-spaced histogram."""

    total = sum(histogram.values())
    if total == 0:
        return 0.0
    target = quantile * total
    cumulative = 0
    for index in sorted(histogram):
        cumulative += histogram[index]
        if cumulative >= target:
            return _bin_centre_ms(index)
    return _bin_centre_ms(max(histogram))


# --------------------------------------------------------------------------- #
# Trace -> architecture
# --------------------------------------------------------------------------- #


def _is_missing(name: str) -> bool:
    return name.strip().lower() in MISSING_NAMES


def _rpcid_depth(rpcid: str) -> int:
    return rpcid.count(".")


class TraceAccumulator:
    """Edges and timings gathered for one in-flight traceid."""

    __slots__ = ("edges", "entry_rt", "entry_depth", "max_rt", "last_row")

    def __init__(self, last_row: int) -> None:
        # (um, dm) -> rpctype
        self.edges: Dict[Tuple[str, str], str] = {}
        self.entry_rt: Optional[float] = None
        self.entry_depth: int = 1 << 30
        self.max_rt: float = 0.0
        self.last_row: int = last_row

    def add(self, um: str, dm: str, rpctype: str, rpcid: str, rt: float, row: int) -> None:
        self.edges[(um, dm)] = rpctype
        self.last_row = row

        # RPC calls are logged twice -- positive on the caller, negative on the
        # callee. Magnitude is the latency either way.
        magnitude = abs(rt)
        if magnitude > self.max_rt:
            self.max_rt = magnitude

        # The shallowest rpcid is the call the proxy made, so its response time
        # is the user-facing end-to-end latency of the whole call graph.
        depth = _rpcid_depth(rpcid)
        if depth < self.entry_depth or (depth == self.entry_depth and magnitude > (self.entry_rt or 0.0)):
            self.entry_depth = depth
            self.entry_rt = magnitude


def _canonical_signature(
    node_roles: Dict[str, str],
    edges: Dict[Tuple[str, str], str],
) -> str:
    """Weisfeiler-Lehman hash of a role-labelled, kind-labelled digraph.

    Invariant to node naming and ordering, so the same topology realised by
    different Alibaba services collapses to one signature.
    """

    colours = {node: role for node, role in node_roles.items()}
    outgoing: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
    incoming: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
    for (source, target), kind in edges.items():
        outgoing[source].append((kind, target))
        incoming[target].append((kind, source))

    for _ in range(WL_ITERATIONS):
        refreshed: Dict[str, str] = {}
        for node in node_roles:
            out_labels = sorted(f">{kind}:{colours[peer]}" for kind, peer in outgoing.get(node, []))
            in_labels = sorted(f"<{kind}:{colours[peer]}" for kind, peer in incoming.get(node, []))
            payload = colours[node] + "|" + ",".join(out_labels) + "|" + ",".join(in_labels)
            refreshed[node] = hashlib.blake2b(payload.encode("utf-8"), digest_size=8).hexdigest()
        colours = refreshed

    fingerprint = "|".join(sorted(colours.values()))
    fingerprint += "#n=%d#e=%d" % (len(node_roles), len(edges))
    return hashlib.blake2b(fingerprint.encode("utf-8"), digest_size=16).hexdigest()


def trace_to_architecture(trace: TraceAccumulator):
    """Convert one accumulated trace into (signature, roles, edges, latency).

    Returns None when the trace is too small, too large, or its end-to-end
    latency could not be recovered.
    """

    if not trace.edges:
        return None

    # Assign every node a role. A node's role comes from how it is called; the
    # entry microservice (never a callee) is the gateway.
    callees: Dict[str, str] = {}
    nodes = set()
    for (um, dm), rpctype in trace.edges.items():
        nodes.add(um)
        nodes.add(dm)
        # A node reached by several kinds of call takes the most specific one:
        # a store called over `db` stays a database even if also probed by rpc.
        existing = callees.get(dm)
        if existing is None or existing in {"rpc", "http"}:
            callees[dm] = rpctype

    if not (MIN_NODES_PER_ARCH <= len(nodes) <= MAX_NODES_PER_ARCH):
        return None

    roles = {
        node: role_from_rpctype(callees.get(node), is_entry=node not in callees)
        for node in nodes
    }

    latency_ms = trace.entry_rt if trace.entry_rt else trace.max_rt
    if latency_ms is None or latency_ms <= 0.0:
        return None

    signature = _canonical_signature(roles, trace.edges)
    return signature, roles, trace.edges, latency_ms


# --------------------------------------------------------------------------- #
# Streaming one tarball
# --------------------------------------------------------------------------- #


class ArchitectureStore:
    """Accumulates per-structure latency histograms with bounded memory."""

    def __init__(self) -> None:
        # signature -> {roles, edges, hist, count}
        self.buckets: Dict[str, Dict] = {}
        self.traces_used = 0
        self.traces_skipped = 0

    def add(self, signature: str, roles, edges, latency_ms: float) -> None:
        bucket = self.buckets.get(signature)
        if bucket is None:
            # Store one concrete realisation of the structure, anonymised to
            # dense indices so the payload carries no Alibaba service hashes.
            order = sorted(roles)
            index_of = {name: i for i, name in enumerate(order)}
            bucket = {
                "roles": [roles[name] for name in order],
                "edges": sorted(
                    (index_of[um], index_of[dm], kind)
                    for (um, dm), kind in edges.items()
                ),
                "hist": defaultdict(int),
                "count": 0,
            }
            self.buckets[signature] = bucket

        bucket["hist"][_hist_bin(latency_ms)] += 1
        bucket["count"] += 1
        self.traces_used += 1


def _open_csv_streams(tar_path: Path) -> Iterator[Tuple[str, io.TextIOWrapper]]:
    """Yield (member_name, text stream) for every CSV inside a tarball.

    Streams straight out of the compressed archive: nothing is written to disk,
    which keeps peak disk usage flat no matter how large the extracted CSV is.
    """

    with tarfile.open(tar_path, "r:gz") as archive:
        for member in archive:
            if not member.isfile() or not member.name.lower().endswith(".csv"):
                continue
            handle = archive.extractfile(member)
            if handle is None:
                continue
            yield member.name, io.TextIOWrapper(handle, encoding="utf-8", errors="replace")


def _column_indices(header: List[str]) -> Optional[Dict[str, int]]:
    """Locate the columns we need, tolerating the v2021/v2022 schema drift."""

    lookup = {name.strip().lower(): index for index, name in enumerate(header)}
    resolved = {}
    for key, aliases in (
        ("traceid", ("traceid",)),
        ("rpcid", ("rpcid", "rpc_id")),
        ("um", ("um",)),
        ("dm", ("dm",)),
        ("rpctype", ("rpctype", "rpc_type")),
        ("rt", ("rt",)),
    ):
        for alias in aliases:
            if alias in lookup:
                resolved[key] = lookup[alias]
                break
        else:
            return None
    return resolved


def process_tarball(tar_path: Path, store: ArchitectureStore, row_limit: int = 0) -> Dict:
    """Stream one tarball into the architecture store."""

    started = time.time()
    rows_seen = 0
    rows_kept = 0
    live: Dict[str, TraceAccumulator] = {}

    def flush(cutoff_row: int, force: bool = False) -> None:
        stale = [
            trace_id
            for trace_id, accumulator in live.items()
            if force or accumulator.last_row < cutoff_row
        ]
        for trace_id in stale:
            accumulator = live.pop(trace_id)
            result = trace_to_architecture(accumulator)
            if result is None:
                store.traces_skipped += 1
                continue
            store.add(*result)

    for member_name, stream in _open_csv_streams(tar_path):
        reader = csv.reader(stream)
        try:
            header = next(reader)
        except StopIteration:
            continue

        columns = _column_indices(header)
        if columns is None:
            print(f"    ! {member_name}: unrecognised header {header[:12]}", file=sys.stderr)
            continue

        idx_trace = columns["traceid"]
        idx_rpcid = columns["rpcid"]
        idx_um = columns["um"]
        idx_dm = columns["dm"]
        idx_type = columns["rpctype"]
        idx_rt = columns["rt"]
        widest = max(columns.values())

        for row in reader:
            rows_seen += 1

            if len(row) > widest:
                um = row[idx_um]
                dm = row[idx_dm]
                if not (_is_missing(um) or _is_missing(dm) or um == dm):
                    try:
                        rt = float(row[idx_rt])
                    except (TypeError, ValueError):
                        rt = 0.0
                    trace_id = row[idx_trace]
                    accumulator = live.get(trace_id)
                    if accumulator is None:
                        accumulator = TraceAccumulator(rows_seen)
                        live[trace_id] = accumulator
                    accumulator.add(um, dm, row[idx_type], row[idx_rpcid], rt, rows_seen)
                    rows_kept += 1

            if rows_seen % FLUSH_EVERY_ROWS == 0:
                flush(rows_seen - TRACE_WINDOW_ROWS)

            if row_limit and rows_seen >= row_limit:
                break

        if row_limit and rows_seen >= row_limit:
            break

    flush(0, force=True)

    return {
        "file": tar_path.name,
        "rows_seen": rows_seen,
        "rows_kept": rows_kept,
        "seconds": round(time.time() - started, 1),
    }


# --------------------------------------------------------------------------- #
# Shard persistence
# --------------------------------------------------------------------------- #


def write_shard(store: ArchitectureStore, shard_path: Path) -> int:
    """Persist a store to a gzipped JSONL shard, one architecture per line.

    Written to a process-unique temporary file and then moved into place, so a
    shard on disk is always complete. A crash mid-write leaves a stray .tmp
    rather than a truncated shard that the merge would silently read as real,
    and two builders racing on the same tarball cannot interleave their output.
    """

    shard_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = shard_path.with_suffix(f".{os.getpid()}.tmp")

    written = 0
    try:
        with gzip.open(temporary_path, "wt", encoding="utf-8") as handle:
            for signature, bucket in store.buckets.items():
                handle.write(
                    json.dumps(
                        {
                            "sig": signature,
                            "roles": bucket["roles"],
                            "edges": bucket["edges"],
                            "hist": {str(k): v for k, v in bucket["hist"].items()},
                            "count": bucket["count"],
                        },
                        separators=(",", ":"),
                    )
                )
                handle.write("\n")
                written += 1
        os.replace(temporary_path, shard_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink(missing_ok=True)

    return written


def _completed_downloads() -> Optional[set]:
    """Names the downloader has confirmed finished, so partial files are skipped.

    Lets shard building run alongside a still-running download: a tarball that
    is only half on disk simply is not offered up yet, and gets picked up on a
    later pass once the downloader logs it.
    """

    log_path = RAW_V2021_DIR.parent / "download.log"
    if not log_path.exists():
        return None
    names = set()
    for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("done: "):
            names.add(line[len("done: "):].split(" (")[0].strip())
    return names or None


def build_shards(row_limit: int = 0, limit_files: int = 0, require_complete: bool = True) -> None:
    """Stream every downloaded tarball into one shard apiece."""

    completed = _completed_downloads() if require_complete else None

    tarballs: List[Tuple[str, Path]] = []
    for source, directory in (("v2021", RAW_V2021_DIR), ("v2022", RAW_V2022_DIR)):
        if directory.exists():
            for path in sorted(directory.glob("*.tar.gz")):
                if completed is not None and path.name not in completed:
                    continue
                tarballs.append((source, path))

    if not tarballs:
        raise FileNotFoundError(
            f"No tarballs found under {RAW_V2021_DIR} or {RAW_V2022_DIR}. "
            "Run the download script first."
        )

    if limit_files:
        tarballs = tarballs[:limit_files]

    ARCH_SHARDS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Building shards from {len(tarballs)} tarballs\n")

    for position, (source, tar_path) in enumerate(tarballs, start=1):
        shard_path = ARCH_SHARDS_DIR / f"{source}__{tar_path.stem.replace('.tar', '')}.jsonl.gz"
        if shard_path.exists():
            print(f"[{position}/{len(tarballs)}] {tar_path.name}: shard exists, skipping")
            continue

        store = ArchitectureStore()
        try:
            stats = process_tarball(tar_path, store, row_limit=row_limit)
        except (tarfile.TarError, EOFError, OSError) as error:
            print(f"[{position}/{len(tarballs)}] {tar_path.name}: UNREADABLE ({error}) -- skipped")
            continue

        written = write_shard(store, shard_path)
        print(
            f"[{position}/{len(tarballs)}] {tar_path.name}: "
            f"{stats['rows_seen']:,} rows -> {stats['rows_kept']:,} calls -> "
            f"{store.traces_used:,} traces -> {written:,} structures "
            f"({stats['seconds']}s)"
        )


# --------------------------------------------------------------------------- #
# Merge + label
# --------------------------------------------------------------------------- #


def merge_and_label(
    quantile: float = 0.95,
    min_observations: int = MIN_TRACE_INSTANCES,
    output_path: Optional[Path] = None,
) -> Dict:
    """Merge every shard, cut risk terciles from measured tail latency.

    The two knobs matter for label quality, not just bookkeeping:

    `quantile` is the tail statistic the grade is cut from. p99 is the more
    familiar SLI, but estimating it well needs far more observations than p95
    does -- the 99th percentile of 20 samples is just the maximum, which is
    almost pure noise.

    `min_observations` is how many traces a topology must be seen in before its
    tail estimate is trusted. Set it too low and the labels are noise, which
    caps achievable accuracy no matter how good the model is; set it too high
    and the dataset shrinks. Choose it from the observation histogram the merge
    prints, not by whichever value flatters the metrics.
    """

    shards = sorted(ARCH_SHARDS_DIR.glob("*.jsonl.gz"))
    if not shards:
        raise FileNotFoundError(f"No shards in {ARCH_SHARDS_DIR}; run build_shards first.")

    unreadable: List[str] = []

    def read_shard(shard: Path):
        """Yield records from one shard, skipping any still being written."""

        try:
            handle = gzip.open(shard, "rt", encoding="utf-8")
        except (OSError, EOFError, gzip.BadGzipFile) as error:
            unreadable.append(f"{shard.name} ({error})")
            return
        try:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
        except (OSError, EOFError, gzip.BadGzipFile) as error:
            unreadable.append(f"{shard.name} ({error})")
        finally:
            handle.close()

    # ---- pass 1: latency histograms only -------------------------------- #
    #
    # Deliberately does not retain roles or edges. Most structures will not
    # clear the observation floor, and holding every structure's full topology
    # through the merge is what would push this into gigabytes on a small
    # machine. Histograms alone are compact and are all the filter needs.
    histograms: Dict[str, Dict[int, int]] = {}
    counts: Dict[str, int] = {}

    for shard in shards:
        for record in read_shard(shard):
            signature = record["sig"]
            histogram = histograms.get(signature)
            if histogram is None:
                histograms[signature] = {int(k): v for k, v in record["hist"].items()}
                counts[signature] = record["count"]
            else:
                for key, value in record["hist"].items():
                    index = int(key)
                    histogram[index] = histogram.get(index, 0) + value
                counts[signature] += record["count"]
        print(f"  merged {shard.name}: running total {len(histograms):,} structures")

    if unreadable:
        print(f"\n  skipped {len(unreadable)} incomplete shard(s): {', '.join(unreadable[:3])}")

    # How well-observed are these structures? This distribution is what the
    # min_observations choice should be argued from.
    print("\nobservations per structure:")
    for threshold in (8, 25, 50, 100, 250, 1000):
        qualifying = sum(1 for count in counts.values() if count >= threshold)
        print(f"  >= {threshold:5,} traces: {qualifying:8,} structures")

    distinct_structures = len(histograms)
    eligible_signatures = {
        signature for signature, count in counts.items() if count >= min_observations
    }
    print(
        f"\n{distinct_structures:,} distinct structures -> "
        f"{len(eligible_signatures):,} with >= {min_observations} observations"
    )
    if len(eligible_signatures) < 3:
        raise RuntimeError(
            f"Only {len(eligible_signatures)} structures clear {min_observations} observations; "
            "lower --min-observations or build more shards."
        )

    # Drop the histograms of everything that did not qualify before pass 2
    # brings topologies into memory.
    for signature in list(histograms):
        if signature not in eligible_signatures:
            del histograms[signature]

    # ---- pass 2: topologies for the survivors only ----------------------- #
    topologies: Dict[str, Dict] = {}
    for shard in shards:
        for record in read_shard(shard):
            signature = record["sig"]
            if signature in eligible_signatures and signature not in topologies:
                topologies[signature] = {"roles": record["roles"], "edges": record["edges"]}
        if len(topologies) == len(eligible_signatures):
            break

    scored = []
    for signature in eligible_signatures:
        topology = topologies.get(signature)
        if topology is None:  # only possible if a shard became unreadable mid-run
            continue
        histogram = histograms[signature]
        bucket = {
            "roles": topology["roles"],
            "edges": topology["edges"],
            "count": counts[signature],
        }
        median = histogram_quantile(histogram, 0.50)
        tail = histogram_quantile(histogram, quantile)
        scored.append((signature, bucket, median, tail))

    # Terciles of measured tail latency define the three risk grades. Cutting on
    # quantiles makes the classes balanced by construction, so accuracy is read
    # against a 33.3% random baseline rather than a skewed majority class.
    tail_values = sorted(item[3] for item in scored)
    low_cut = tail_values[len(tail_values) // 3]
    high_cut = tail_values[2 * len(tail_values) // 3]
    label_name = f"p{int(quantile * 100)}"
    print(f"{label_name} tercile cuts: low < {low_cut:.2f} ms <= medium < {high_cut:.2f} ms <= high")

    destination = output_path or DATASET_FILE
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    counts = {"low": 0, "medium": 0, "high": 0}

    with open(destination, "w", encoding="utf-8") as handle:
        for signature, bucket, median, tail in scored:
            if tail < low_cut:
                label = "low"
            elif tail < high_cut:
                label = "medium"
            else:
                label = "high"
            counts[label] += 1

            handle.write(
                json.dumps(
                    {
                        "sig": signature,
                        "roles": bucket["roles"],
                        "edges": bucket["edges"],
                        "label": label,
                        "observations": bucket["count"],
                        "p50_ms": round(median, 3),
                        "tail_ms": round(tail, 3),
                        "tail_quantile": quantile,
                        "tail_amplification": round(tail / median, 3) if median > 0 else 0.0,
                    },
                    separators=(",", ":"),
                )
            )
            handle.write("\n")

    stats = {
        "distinct_structures": distinct_structures,
        "labelled_structures": len(scored),
        "min_observations": min_observations,
        "tail_quantile": quantile,
        "tercile_cuts_ms": {"low_medium": round(low_cut, 3), "medium_high": round(high_cut, 3)},
        "class_counts": counts,
        "shards": len(shards),
        "label_definition": (
            f"Tercile of measured p{int(quantile * 100)} end-to-end response time, pooled "
            f"over every trace realising the same topology, for topologies observed in at "
            f"least {min_observations} traces. Derived only from observed latency; no "
            f"latency, CPU or memory measurement is ever a model input."
        ),
    }
    if destination == DATASET_FILE:
        DATASET_STATS_FILE.write_text(json.dumps(stats, indent=2), encoding="utf-8")

    print(f"\nWrote {len(scored):,} labelled architectures to {destination}")
    print(f"Class balance: {counts}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the microservice architecture dataset.")
    parser.add_argument("--rows-per-file", type=int, default=0, help="Cap rows read per tarball (0 = all).")
    parser.add_argument("--limit-files", type=int, default=0, help="Only process the first N tarballs.")
    parser.add_argument("--shards-only", action="store_true", help="Build shards and stop.")
    parser.add_argument("--merge-only", action="store_true", help="Skip shard building; merge and label.")
    parser.add_argument(
        "--any-file",
        action="store_true",
        help="Process tarballs even if the downloader has not confirmed them complete.",
    )
    parser.add_argument(
        "--tail-quantile",
        type=float,
        default=0.95,
        help="Latency quantile the risk grade is cut from (default 0.95).",
    )
    parser.add_argument(
        "--min-observations",
        type=int,
        default=MIN_TRACE_INSTANCES,
        help="Traces a topology must appear in before its tail estimate is trusted.",
    )
    arguments = parser.parse_args()

    if not arguments.merge_only:
        build_shards(
            row_limit=arguments.rows_per_file,
            limit_files=arguments.limit_files,
            require_complete=not arguments.any_file,
        )
    if not arguments.shards_only:
        merge_and_label(
            quantile=arguments.tail_quantile,
            min_observations=arguments.min_observations,
        )

    if EXTRACT_SCRATCH_DIR.exists():
        shutil.rmtree(EXTRACT_SCRATCH_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
