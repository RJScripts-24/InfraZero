$ErrorActionPreference = "Stop"

Set-Location "c:\Users\rkj24\OneDrive\Desktop\Infrazero"
$root = "frontend/public/Icons"
$targets = @(
  @{ key='aws-ec2'; folder='aws/compute'; patterns=@('ec2','elastic-compute-cloud') },
  @{ key='aws-lambda'; folder='aws/compute'; patterns=@('lambda') },
  @{ key='aws-ecs'; folder='aws/compute'; patterns=@('elastic-container-service','ecs') },
  @{ key='aws-eks'; folder='aws/compute'; patterns=@('elastic-kubernetes-service','eks') },
  @{ key='aws-rds'; folder='aws/database'; patterns=@('rds') },
  @{ key='aws-dynamodb'; folder='aws/database'; patterns=@('dynamodb') },
  @{ key='aws-elasticache'; folder='aws/database'; patterns=@('elasticache') },
  @{ key='aws-alb'; folder='aws/networking'; patterns=@('elastic-load-balancing','application-load-balancer','load-balancer') },
  @{ key='aws-api-gateway'; folder='aws/networking'; patterns=@('api-gateway') },
  @{ key='aws-cloudfront'; folder='aws/networking'; patterns=@('cloudfront') },
  @{ key='aws-route53'; folder='aws/networking'; patterns=@('route-53','route53') },
  @{ key='aws-sqs'; folder='aws/integration'; patterns=@('simple-queue-service','sqs') },
  @{ key='aws-sns'; folder='aws/integration'; patterns=@('simple-notification-service','sns') },
  @{ key='aws-eventbridge'; folder='aws/integration'; patterns=@('eventbridge','event-bridge','event-bus') },
  @{ key='aws-s3'; folder='aws/storage'; patterns=@('simple-storage-service','s3') },
  @{ key='aws-efs'; folder='aws/storage'; patterns=@('elastic-file-system','efs') },

  @{ key='gcp-cloud-run'; folder='gcp/compute'; patterns=@('cloud_run','cloud-run') },
  @{ key='gcp-gce'; folder='gcp/compute'; patterns=@('compute_engine','compute-engine','gce') },
  @{ key='gcp-gke'; folder='gcp/compute'; patterns=@('kubernetes_engine','gke') },
  @{ key='gcp-cloud-sql'; folder='gcp/database'; patterns=@('cloud_sql','cloud-sql') },
  @{ key='gcp-firestore'; folder='gcp/database'; patterns=@('firestore') },
  @{ key='gcp-bigquery'; folder='gcp/database'; patterns=@('bigquery') },
  @{ key='gcp-load-balancing'; folder='gcp/networking'; patterns=@('load_balancing','load-balancing') },
  @{ key='gcp-cloud-cdn'; folder='gcp/networking'; patterns=@('cdn') },

  @{ key='azure-functions'; folder='azure/compute'; patterns=@('function','functions') },
  @{ key='azure-aks'; folder='azure/compute'; patterns=@('kubernetes','aks') },
  @{ key='azure-app-service'; folder='azure/compute'; patterns=@('app-service') },
  @{ key='azure-cosmosdb'; folder='azure/database'; patterns=@('cosmos') },
  @{ key='azure-sql'; folder='azure/database'; patterns=@('sql') },
  @{ key='azure-load-balancer'; folder='azure/networking'; patterns=@('load-balancer') },
  @{ key='azure-api-management'; folder='azure/networking'; patterns=@('api-management') }
)

foreach ($t in $targets) {
  $dir = Join-Path $root $t.folder
  $files = Get-ChildItem $dir -File
  $match = $null
  foreach ($pat in $t.patterns) {
    $match = $files | Where-Object { $_.Name.ToLowerInvariant() -match $pat } | Sort-Object { if ($_.Extension -eq '.svg') {0} else {1} }, Name | Select-Object -First 1
    if ($match) { break }
  }
  if (-not $match) {
    $match = $files | Sort-Object { if ($_.Extension -eq '.svg') {0} else {1} }, Name | Select-Object -First 1
  }

  if ($match) {
    "$($t.key)=$($t.folder)/$($match.Name)"
  } else {
    "$($t.key)=MISSING"
  }
}
