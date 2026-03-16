use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Computes a deterministic SHA-256 hash for a graph projection.
///
/// The hash is stable across:
/// - Different node orderings in the input slice.
/// - Different edge orderings in the input slice.
/// - JSON object key insertion order.
///
/// This is the core reproducibility primitive used by InfraZero.
pub fn compute_stable_hash<N, E>(nodes: &[N], edges: &[E]) -> String
where
    N: Serialize,
    E: Serialize,
{
    let mut node_values = to_values(nodes);
    let mut edge_values = to_values(edges);

    sort_stably_by_id_then_value(&mut node_values);
    sort_stably_by_id_then_value(&mut edge_values);

    let graph_projection = Value::Object(
        [
            ("edges".to_string(), Value::Array(edge_values)),
            ("nodes".to_string(), Value::Array(node_values)),
        ]
        .into_iter()
        .collect(),
    );

    let canonical = canonical_json(&graph_projection);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let digest = hasher.finalize();

    // Lowercase hex output (64 chars).
    format!("{digest:x}")
}

fn to_values<T: Serialize>(items: &[T]) -> Vec<Value> {
    items
        .iter()
        .map(|item| serde_json::to_value(item).unwrap_or(Value::Null))
        .collect()
}

fn sort_stably_by_id_then_value(items: &mut [Value]) {
    items.sort_by(|a, b| {
        let a_id = extract_id(a);
        let b_id = extract_id(b);

        a_id.cmp(&b_id).then_with(|| canonical_json(a).cmp(&canonical_json(b)))
    });
}

fn extract_id(v: &Value) -> Option<String> {
    match v {
        Value::Object(map) => map.get("id").and_then(|id| id.as_str()).map(str::to_string),
        _ => None,
    }
}

/// Converts JSON into a canonical string form with object keys sorted.
fn canonical_json(v: &Value) -> String {
    match v {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            serde_json::to_string(v).unwrap_or_else(|_| "null".to_string())
        }
        Value::Array(arr) => {
            let mut out = String::from("[");
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical_json(item));
            }
            out.push(']');
            out
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_unstable();

            let mut out = String::from("{");
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string()));
                out.push(':');
                if let Some(value) = map.get(*key) {
                    out.push_str(&canonical_json(value));
                } else {
                    out.push_str("null");
                }
            }
            out.push('}');
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::compute_stable_hash;
    use serde::Serialize;

    #[derive(Debug, Clone, Serialize)]
    struct Node {
        id: String,
        label: String,
        processing_power: f64,
    }

    #[derive(Debug, Clone, Serialize)]
    struct Edge {
        id: String,
        source: String,
        target: String,
        latency_ms: f64,
    }

    #[test]
    fn same_graph_same_hash() {
        let nodes = vec![
            Node {
                id: "api".to_string(),
                label: "API".to_string(),
                processing_power: 1.2,
            },
            Node {
                id: "db".to_string(),
                label: "DB".to_string(),
                processing_power: 0.8,
            },
        ];
        let edges = vec![Edge {
            id: "api->db".to_string(),
            source: "api".to_string(),
            target: "db".to_string(),
            latency_ms: 5.0,
        }];

        let a = compute_stable_hash(&nodes, &edges);
        let b = compute_stable_hash(&nodes, &edges);

        assert_eq!(a, b);
    }

    #[test]
    fn order_changes_do_not_change_hash() {
        let nodes_a = vec![
            Node {
                id: "api".to_string(),
                label: "API".to_string(),
                processing_power: 1.2,
            },
            Node {
                id: "db".to_string(),
                label: "DB".to_string(),
                processing_power: 0.8,
            },
        ];
        let nodes_b = vec![nodes_a[1].clone(), nodes_a[0].clone()];

        let edges_a = vec![
            Edge {
                id: "api->db".to_string(),
                source: "api".to_string(),
                target: "db".to_string(),
                latency_ms: 5.0,
            },
            Edge {
                id: "client->api".to_string(),
                source: "client".to_string(),
                target: "api".to_string(),
                latency_ms: 2.0,
            },
        ];
        let edges_b = vec![edges_a[1].clone(), edges_a[0].clone()];

        let a = compute_stable_hash(&nodes_a, &edges_a);
        let b = compute_stable_hash(&nodes_b, &edges_b);

        assert_eq!(a, b);
    }

    #[test]
    fn topology_change_changes_hash() {
        let nodes = vec![
            Node {
                id: "api".to_string(),
                label: "API".to_string(),
                processing_power: 1.2,
            },
            Node {
                id: "db".to_string(),
                label: "DB".to_string(),
                processing_power: 0.8,
            },
        ];

        let edges_original = vec![Edge {
            id: "api->db".to_string(),
            source: "api".to_string(),
            target: "db".to_string(),
            latency_ms: 5.0,
        }];

        let edges_changed = vec![Edge {
            id: "api->db".to_string(),
            source: "api".to_string(),
            target: "db".to_string(),
            latency_ms: 9.0,
        }];

        let a = compute_stable_hash(&nodes, &edges_original);
        let b = compute_stable_hash(&nodes, &edges_changed);

        assert_ne!(a, b);
    }
}
