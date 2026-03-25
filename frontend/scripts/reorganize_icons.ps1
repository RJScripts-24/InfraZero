$ErrorActionPreference = "Stop"

$root = (Resolve-Path "frontend/public/Icons").Path

$targets = @(
	"aws/compute",
	"aws/database",
	"aws/networking",
	"aws/integration",
	"aws/storage",
	"gcp/compute",
	"gcp/database",
	"gcp/networking",
	"azure/compute",
	"azure/database",
	"azure/networking",
	"generic"
)

foreach ($target in $targets) {
	New-Item -ItemType Directory -Path (Join-Path $root $target) -Force | Out-Null
}

# Rebuild target tree from scratch on each run.
foreach ($target in $targets) {
	$targetPath = Join-Path $root $target
	Get-ChildItem $targetPath -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force
}

$iconExtensions = @('.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico')

$sourceFiles = Get-ChildItem $root -Recurse -File | Where-Object {
	$extension = $_.Extension.ToLowerInvariant()
	$relativePath = $_.FullName.Substring($root.Length + 1).Replace('\', '/').ToLowerInvariant()
	($iconExtensions -contains $extension) -and
	-not (
		$relativePath.StartsWith('aws/') -or
		$relativePath.StartsWith('gcp/') -or
		$relativePath.StartsWith('azure/') -or
		$relativePath.StartsWith('generic/')
	)
}

function Get-Provider([string]$text) {
	$t = $text.ToLowerInvariant()

	if ($t -match 'azure') {
		return 'azure'
	}

	if ($t -match 'google|gcp|bigquery|firestore|cloud[\-_ ]?run|gke|gce|cloud[\-_ ]?sql|cloud[\-_ ]?load|apigee') {
		return 'gcp'
	}

	if ($t -match 'aws|amazon|ec2|lambda|ecs|eks|rds|dynamo|dynamodb|s3|efs|sqs|sns|eventbridge|cloudfront|route[\-_ ]?53|apigateway|api[\-_ ]?gateway') {
		return 'aws'
	}

	return 'generic'
}

function Get-Category([string]$provider, [string]$text) {
	$t = $text.ToLowerInvariant()

	if ($provider -eq 'aws') {
		if ($t -match 'rds|dynamo|dynamodb|elasti|redshift|aurora|documentdb|neptune|timestream|keyspaces|db') {
			return 'database'
		}
		if ($t -match 'alb|load-?balanc|api[\-_ ]?gateway|cloudfront|route[\-_ ]?53|vpc|subnet|transit|direct[\-_ ]?connect|nat[\-_ ]?gateway|network|private[\-_ ]?link') {
			return 'networking'
		}
		if ($t -match 'sqs|sns|eventbridge|mq|kinesis|step[\-_ ]?functions|appflow|integration') {
			return 'integration'
		}
		if ($t -match 's3|efs|storage|backup|fsx|glacier|ebs') {
			return 'storage'
		}
		return 'compute'
	}

	if ($provider -eq 'gcp') {
		if ($t -match 'cloud[\-_ ]?sql|firestore|bigquery|bigtable|spanner|database|datastore|alloydb') {
			return 'database'
		}
		if ($t -match 'load[\-_ ]?balanc|cloud[\-_ ]?cdn|cdn|network|vpc|nat|dns|interconnect|api[\-_ ]?gateway|apigee') {
			return 'networking'
		}
		return 'compute'
	}

	if ($provider -eq 'azure') {
		if ($t -match 'cosmos|sql|database|postgres|mysql|maria|cache') {
			return 'database'
		}
		if ($t -match 'load[\-_ ]?balanc|api[\-_ ]?management|application[\-_ ]?gateway|front[\-_ ]?door|cdn|dns|network|traffic[\-_ ]?manager') {
			return 'networking'
		}
		return 'compute'
	}

	return ''
}

function Get-ShortHash([string]$text) {
	$sha1 = [System.Security.Cryptography.SHA1]::Create()
	try {
		$bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
		$hashBytes = $sha1.ComputeHash($bytes)
		return ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant().Substring(0, 10)
	}
	finally {
		$sha1.Dispose()
	}
}

$copiedCount = 0

foreach ($sourceFile in $sourceFiles) {
	$relativePath = $sourceFile.FullName.Substring($root.Length + 1).Replace('\', '/')
	$text = "$relativePath $($sourceFile.Name)"
	$provider = Get-Provider $text

	if ($provider -eq 'generic') {
		$destinationFolder = Join-Path $root 'generic'
	}
	else {
		$category = Get-Category $provider $text
		$destinationFolder = Join-Path $root "$provider/$category"
	}

	$shortHash = Get-ShortHash $relativePath
	$destinationName = "${shortHash}_$($sourceFile.Name)"
	$destinationPath = Join-Path $destinationFolder $destinationName

	Copy-Item -LiteralPath $sourceFile.FullName -Destination $destinationPath -Force
	$copiedCount++
}

# Create canonical generic icon names requested by the user.
$canonicalIcons = @{
	'kafka.svg' = 'kafka'
	'redis.svg' = 'redis'
	'postgresql.svg' = 'postgres|postgresql'
	'nginx.svg' = 'nginx'
	'docker.svg' = 'docker'
	'kubernetes.svg' = 'kubernetes|k8s'
	'rabbitmq.svg' = 'rabbitmq|rabbit'
}

foreach ($targetName in $canonicalIcons.Keys) {
	$pattern = $canonicalIcons[$targetName]

	$match = Get-ChildItem (Join-Path $root 'generic') -File -Filter *.svg |
		Where-Object { $_.Name.ToLowerInvariant() -match $pattern } |
		Select-Object -First 1

	if (-not $match) {
		$match = Get-ChildItem $root -Recurse -File -Filter *.svg |
			Where-Object {
				$rel = $_.FullName.Substring($root.Length + 1).Replace('\\', '/').ToLowerInvariant()
				-not (
					$rel.StartsWith('aws/') -or
					$rel.StartsWith('gcp/') -or
					$rel.StartsWith('azure/') -or
					$rel.StartsWith('generic/')
				) -and $_.Name.ToLowerInvariant() -match $pattern
			} |
			Select-Object -First 1
	}

	if ($match) {
		Copy-Item -LiteralPath $match.FullName -Destination (Join-Path $root "generic/$targetName") -Force
	}
}

$newTreeCount = Get-ChildItem $root -Recurse -File | Where-Object {
	$extension = $_.Extension.ToLowerInvariant()
	$relativePath = $_.FullName.Substring($root.Length + 1).Replace('\', '/').ToLowerInvariant()
	($iconExtensions -contains $extension) -and
	(
		$relativePath.StartsWith('aws/') -or
		$relativePath.StartsWith('gcp/') -or
		$relativePath.StartsWith('azure/') -or
		$relativePath.StartsWith('generic/')
	)
} | Measure-Object | Select-Object -ExpandProperty Count

"SOURCE_ICON_FILES=$($sourceFiles.Count)"
"COPIED_TO_NEW_TREE=$copiedCount"
"NEW_TREE_ICON_FILES=$newTreeCount"
