export interface PrimitiveItem {
  id: string;
  name: string;
  type: string;
  provider: 'aws' | 'gcp' | 'azure' | 'generic';
  section: string;
  iconPath: string;
  keywords: string[];
}

export const DEFAULT_ARCHITECTURE_ICON = '/Icons/generic/kubernetes.svg';

export const PRIMITIVE_ITEMS: PrimitiveItem[] = [
  // ── AWS / Compute ───────────────────────────────────────────────────────────
  { id: 'aws-ec2', name: 'EC2', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/06db6a9207_Arch_Amazon-EC2_32.svg', keywords: ['ec2', 'compute', 'instance', 'virtual machine', 'vm', 'server'] },
  { id: 'aws-lambda', name: 'Lambda', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/1016b1b2bd_Arch_AWS-Lambda_32.svg', keywords: ['lambda', 'function', 'serverless', 'faas'] },
  { id: 'aws-ecs', name: 'ECS', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/1134487ebb_._Arch_Amazon-ECS-Anywhere_48.svg', keywords: ['ecs', 'container service', 'elastic container service', 'container'] },
  { id: 'aws-eks', name: 'EKS', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/0f0d514cd9_Arch_Amazon-EKS-Anywhere_48.svg', keywords: ['eks', 'kubernetes', 'elastic kubernetes', 'k8s'] },
  { id: 'aws-fargate', name: 'Fargate', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/5f103adf3e_Arch_AWS-Fargate_48.svg', keywords: ['fargate', 'serverless container'] },
  { id: 'aws-app-runner', name: 'App Runner', type: 'AWS Compute', provider: 'aws', section: 'AWS / Compute', iconPath: '/Icons/aws/compute/283727889e_Arch_AWS-App-Runner_32.svg', keywords: ['app runner'] },

  // ── AWS / Database ──────────────────────────────────────────────────────────
  { id: 'aws-rds', name: 'RDS', type: 'AWS Database', provider: 'aws', section: 'AWS / Database', iconPath: '/Icons/aws/database/003a1f4122_._Res_Amazon-RDS_Multi-AZ_48.svg', keywords: ['rds', 'relational', 'database', 'mysql', 'postgres'] },
  { id: 'aws-aurora', name: 'Aurora', type: 'AWS Database', provider: 'aws', section: 'AWS / Database', iconPath: '/Icons/aws/database/78ec5aaad3_Arch_Amazon-Aurora_48.svg', keywords: ['aurora', 'aurora db', 'aurora mysql', 'aurora postgres'] },
  { id: 'aws-dynamodb', name: 'DynamoDB', type: 'AWS Database', provider: 'aws', section: 'AWS / Database', iconPath: '/Icons/aws/database/2017930a86_Res_Amazon-DynamoDB_Attribute_48.svg', keywords: ['dynamodb', 'dynamo', 'nosql'] },
  { id: 'aws-elasticache', name: 'ElastiCache', type: 'AWS Database', provider: 'aws', section: 'AWS / Database', iconPath: '/Icons/aws/database/0783600cea_._Arch_Amazon-ElastiCache_48.svg', keywords: ['elasticache', 'cache', 'redis', 'memcached'] },

  // ── AWS / Networking ────────────────────────────────────────────────────────
  { id: 'aws-alb', name: 'ALB', type: 'AWS Networking', provider: 'aws', section: 'AWS / Networking', iconPath: '/Icons/aws/networking/0043b1e0fe_._Arch_AWS-App-Mesh_64.svg', keywords: ['alb', 'load balancer', 'application load balancer', 'elb'] },
  { id: 'aws-api-gateway', name: 'API Gateway', type: 'AWS Networking', provider: 'aws', section: 'AWS / Networking', iconPath: '/Icons/aws/networking/0ea85e0ded_Arch_Amazon-API-Gateway_16.svg', keywords: ['api gateway', 'gateway', 'rest api', 'http api'] },
  { id: 'aws-cloudfront', name: 'CloudFront', type: 'AWS Networking', provider: 'aws', section: 'AWS / Networking', iconPath: '/Icons/aws/networking/162789f112_._Arch_Amazon-CloudFront_48.svg', keywords: ['cloudfront', 'cdn', 'edge', 'content delivery'] },
  { id: 'aws-route53', name: 'Route 53', type: 'AWS Networking', provider: 'aws', section: 'AWS / Networking', iconPath: '/Icons/aws/networking/118da4f174_._Res_Amazon-Route-53_Route-Table_48.svg', keywords: ['route53', 'route 53', 'dns'] },
  { id: 'aws-vpc', name: 'VPC', type: 'AWS Networking', provider: 'aws', section: 'AWS / Networking', iconPath: '/Icons/aws/networking/e1e5fb2e3a_Res_Amazon-VPC_Virtual-private-cloud-VPC_48.svg', keywords: ['vpc', 'virtual private cloud', 'network'] },

  // ── AWS / Integration ───────────────────────────────────────────────────────
  { id: 'aws-sqs', name: 'SQS', type: 'AWS Integration', provider: 'aws', section: 'AWS / Integration', iconPath: '/Icons/aws/integration/02a44c3891_Arch_Amazon-Simple-Queue-Service_48.svg', keywords: ['sqs', 'queue', 'message queue', 'simple queue'] },
  { id: 'aws-sns', name: 'SNS', type: 'AWS Integration', provider: 'aws', section: 'AWS / Integration', iconPath: '/Icons/aws/integration/096ce1f4a3_._Arch_Amazon-Simple-Notification-Service_32.svg', keywords: ['sns', 'notification', 'pubsub', 'simple notification'] },
  { id: 'aws-eventbridge', name: 'EventBridge', type: 'AWS Integration', provider: 'aws', section: 'AWS / Integration', iconPath: '/Icons/aws/integration/06226c2395_Res_Amazon-EventBridge_Pipes_48.svg', keywords: ['eventbridge', 'event bus', 'events'] },
  { id: 'aws-step-functions', name: 'Step Functions', type: 'AWS Integration', provider: 'aws', section: 'AWS / Integration', iconPath: '/Icons/aws/integration/0396b0be47_Arch_AWS-Step-Functions_48.svg', keywords: ['step functions', 'state machine', 'workflow', 'orchestration'] },
  { id: 'aws-kinesis', name: 'Kinesis', type: 'AWS Integration', provider: 'aws', section: 'AWS / Integration', iconPath: '/Icons/aws/integration/30b1ebce02_Arch_Amazon-Kinesis_48.svg', keywords: ['kinesis', 'streaming', 'data stream', 'real-time'] },

  // ── AWS / Storage ───────────────────────────────────────────────────────────
  { id: 'aws-s3', name: 'S3', type: 'AWS Storage', provider: 'aws', section: 'AWS / Storage', iconPath: '/Icons/aws/storage/004d280af0_Res_Amazon-Simple-Storage-Service_S3-Storage-Lens_48.svg', keywords: ['s3', 'object storage', 'bucket', 'simple storage'] },
  { id: 'aws-efs', name: 'EFS', type: 'AWS Storage', provider: 'aws', section: 'AWS / Storage', iconPath: '/Icons/aws/storage/69658e30e2_._Arch_Amazon-EFS_48.svg', keywords: ['efs', 'file system', 'elastic file system'] },

  // ── AWS / Security & Management ─────────────────────────────────────────────
  { id: 'aws-iam', name: 'IAM', type: 'AWS Security', provider: 'aws', section: 'AWS / Security', iconPath: '/Icons/aws/compute/de7ea5d489_Arch_AWS-Identity-and-Access-Management_48.svg', keywords: ['iam', 'identity', 'access management', 'roles', 'permissions'] },
  { id: 'aws-cognito', name: 'Cognito', type: 'AWS Security', provider: 'aws', section: 'AWS / Security', iconPath: '/Icons/aws/compute/efbf8cac66_Arch_Amazon-Cognito_48.svg', keywords: ['cognito', 'auth', 'authentication', 'user pool', 'identity pool'] },
  { id: 'aws-waf', name: 'WAF', type: 'AWS Security', provider: 'aws', section: 'AWS / Security', iconPath: '/Icons/aws/compute/b3e17b8b73_Arch_AWS-WAF_48.svg', keywords: ['waf', 'web application firewall', 'firewall'] },
  { id: 'aws-secrets-manager', name: 'Secrets Manager', type: 'AWS Security', provider: 'aws', section: 'AWS / Security', iconPath: '/Icons/aws/compute/ab9a553c10_Arch_AWS-Secrets-Manager_48.svg', keywords: ['secrets manager', 'secrets', 'vault'] },
  { id: 'aws-cloudwatch', name: 'CloudWatch', type: 'AWS Management', provider: 'aws', section: 'AWS / Management', iconPath: '/Icons/aws/compute/4abe624c8c_Arch_Amazon-CloudWatch_48.svg', keywords: ['cloudwatch', 'monitoring', 'logs', 'metrics', 'alarms'] },
  { id: 'aws-glue', name: 'Glue', type: 'AWS Analytics', provider: 'aws', section: 'AWS / Management', iconPath: '/Icons/aws/compute/20d0311660_Arch_AWS-Glue_48.svg', keywords: ['glue', 'etl', 'data catalog', 'crawler'] },

  // ── AWS / AI ────────────────────────────────────────────────────────────────
  { id: 'aws-sagemaker', name: 'SageMaker', type: 'AWS AI/ML', provider: 'aws', section: 'AWS / AI', iconPath: '/Icons/aws/compute/154def0b1b_Arch_Amazon-SageMaker_32.svg', keywords: ['sagemaker', 'machine learning', 'ml', 'training', 'model'] },
  { id: 'aws-bedrock', name: 'Bedrock', type: 'AWS AI/ML', provider: 'aws', section: 'AWS / AI', iconPath: '/Icons/aws/compute/c01a7a228c_Arch_Amazon-Bedrock_48.svg', keywords: ['bedrock', 'llm', 'generative ai', 'foundation model'] },

  // ── GCP / Compute ───────────────────────────────────────────────────────────
  { id: 'gcp-cloud-run', name: 'Cloud Run', type: 'GCP Compute', provider: 'gcp', section: 'GCP / Compute', iconPath: '/Icons/gcp/compute/7906c95a27_cloud_run_for_anthos.svg', keywords: ['cloud run', 'serverless', 'container'] },
  { id: 'gcp-gce', name: 'Compute Engine', type: 'GCP Compute', provider: 'gcp', section: 'GCP / Compute', iconPath: '/Icons/gcp/compute/6a87322644_compute_engine.svg', keywords: ['gce', 'compute engine', 'vm', 'virtual machine'] },
  { id: 'gcp-gke', name: 'GKE', type: 'GCP Compute', provider: 'gcp', section: 'GCP / Compute', iconPath: '/Icons/gcp/compute/2195b89d07_google_kubernetes_engine.svg', keywords: ['gke', 'kubernetes engine', 'kubernetes', 'k8s'] },
  { id: 'gcp-cloud-functions', name: 'Cloud Functions', type: 'GCP Compute', provider: 'gcp', section: 'GCP / Compute', iconPath: '/Icons/gcp/compute/b96627023d_cloud_functions.svg', keywords: ['cloud functions', 'function', 'serverless', 'faas'] },
  { id: 'gcp-app-engine', name: 'App Engine', type: 'GCP Compute', provider: 'gcp', section: 'GCP / Compute', iconPath: '/Icons/gcp/compute/a769dd963a_app_engine.svg', keywords: ['app engine', 'paas'] },

  // ── GCP / Database ──────────────────────────────────────────────────────────
  { id: 'gcp-cloud-sql', name: 'Cloud SQL', type: 'GCP Database', provider: 'gcp', section: 'GCP / Database', iconPath: '/Icons/gcp/database/48f9538c6a_cloud_sql.svg', keywords: ['cloud sql', 'sql', 'mysql', 'postgres'] },
  { id: 'gcp-firestore', name: 'Firestore', type: 'GCP Database', provider: 'gcp', section: 'GCP / Database', iconPath: '/Icons/gcp/database/19f63ef3e7_firestore.svg', keywords: ['firestore', 'nosql', 'document db'] },
  { id: 'gcp-bigquery', name: 'BigQuery', type: 'GCP Database', provider: 'gcp', section: 'GCP / Database', iconPath: '/Icons/gcp/database/3c4d64ef6e_BigQuery-512-color.svg', keywords: ['bigquery', 'warehouse', 'data warehouse', 'analytics'] },

  // ── GCP / Networking ────────────────────────────────────────────────────────
  { id: 'gcp-load-balancing', name: 'Cloud Load Balancing', type: 'GCP Networking', provider: 'gcp', section: 'GCP / Networking', iconPath: '/Icons/gcp/networking/983c09497f_cloud_load_balancing.svg', keywords: ['load balancing', 'load balancer'] },
  { id: 'gcp-cloud-cdn', name: 'Cloud CDN', type: 'GCP Networking', provider: 'gcp', section: 'GCP / Networking', iconPath: '/Icons/gcp/networking/381b670dd0_cloud_cdn.svg', keywords: ['cloud cdn', 'cdn', 'content delivery'] },
  { id: 'gcp-cloud-armor', name: 'Cloud Armor', type: 'GCP Networking', provider: 'gcp', section: 'GCP / Networking', iconPath: '/Icons/gcp/compute/879d589bab_cloud_armor.svg', keywords: ['cloud armor', 'ddos', 'waf', 'firewall'] },

  // ── GCP / Integration & AI ──────────────────────────────────────────────────
  { id: 'gcp-pub-sub', name: 'Pub/Sub', type: 'GCP Integration', provider: 'gcp', section: 'GCP / Integration', iconPath: '/Icons/gcp/compute/db8839196a_pubsub.svg', keywords: ['pub/sub', 'pubsub', 'messaging', 'event'] },
  { id: 'gcp-cloud-storage', name: 'Cloud Storage', type: 'GCP Storage', provider: 'gcp', section: 'GCP / Storage', iconPath: '/Icons/gcp/compute/b98776d886_cloud_storage.svg', keywords: ['cloud storage', 'gcs', 'bucket', 'object storage', 'blob'] },
  { id: 'gcp-secret-manager', name: 'Secret Manager', type: 'GCP Security', provider: 'gcp', section: 'GCP / Security', iconPath: '/Icons/gcp/compute/35f5288451_secret_manager.svg', keywords: ['secret manager', 'secrets', 'vault'] },
  { id: 'gcp-vertex-ai', name: 'Vertex AI', type: 'GCP AI/ML', provider: 'gcp', section: 'GCP / AI', iconPath: '/Icons/gcp/compute/55cb1c8011_vertexai.svg', keywords: ['vertex ai', 'vertex', 'machine learning', 'ml', 'ai'] },

  // ── Azure / Compute ─────────────────────────────────────────────────────────
  { id: 'azure-functions', name: 'Azure Functions', type: 'Azure Compute', provider: 'azure', section: 'Azure / Compute', iconPath: '/Icons/azure/compute/1521f16946_10029-icon-service-Function-Apps.svg', keywords: ['azure functions', 'function app', 'function', 'serverless'] },
  { id: 'azure-aks', name: 'AKS', type: 'Azure Compute', provider: 'azure', section: 'Azure / Compute', iconPath: '/Icons/azure/compute/02bdc38098_10023-icon-service-Kubernetes-Services.svg', keywords: ['aks', 'kubernetes service', 'kubernetes', 'k8s'] },
  { id: 'azure-app-service', name: 'App Service', type: 'Azure Compute', provider: 'azure', section: 'Azure / Compute', iconPath: '/Icons/azure/compute/14c7c0a945_10035-icon-service-App-Services.svg', keywords: ['app service', 'web app'] },

  // ── Azure / Database ────────────────────────────────────────────────────────
  { id: 'azure-cosmosdb', name: 'Cosmos DB', type: 'Azure Database', provider: 'azure', section: 'Azure / Database', iconPath: '/Icons/azure/database/584f18628c_10121-icon-service-Azure-Cosmos-DB.svg', keywords: ['cosmos', 'cosmos db', 'cosmosdb', 'nosql'] },
  { id: 'azure-sql', name: 'Azure SQL', type: 'Azure Database', provider: 'azure', section: 'Azure / Database', iconPath: '/Icons/azure/database/008b1db3c8_10130-icon-service-SQL-Database.svg', keywords: ['azure sql', 'sql database', 'sql server'] },

  // ── Azure / Networking ──────────────────────────────────────────────────────
  { id: 'azure-load-balancer', name: 'Azure Load Balancer', type: 'Azure Networking', provider: 'azure', section: 'Azure / Networking', iconPath: '/Icons/azure/networking/298de4c29e_029029174-icon-service-Load-Balancer-Hub.svg', keywords: ['azure load balancer', 'load balancer'] },
  { id: 'azure-api-management', name: 'API Management', type: 'Azure Networking', provider: 'azure', section: 'Azure / Networking', iconPath: '/Icons/azure/networking/07d36b9440_10042-icon-service-API-Management-Services.svg', keywords: ['api management', 'apim'] },

  // ── Generic ─────────────────────────────────────────────────────────────────
  { id: 'generic-kafka', name: 'Kafka', type: 'Generic Integration', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/kafka.svg', keywords: ['kafka', 'stream', 'event streaming', 'apache kafka'] },
  { id: 'generic-redis', name: 'Redis', type: 'Generic Cache', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/redis.svg', keywords: ['redis', 'cache', 'in-memory'] },
  { id: 'generic-postgresql', name: 'PostgreSQL', type: 'Generic Database', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/postgresql.svg', keywords: ['postgres', 'postgresql', 'pg'] },
  { id: 'generic-nginx', name: 'Nginx', type: 'Generic Edge', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/nginx.svg', keywords: ['nginx', 'ingress', 'reverse proxy', 'web server'] },
  { id: 'generic-docker', name: 'Docker', type: 'Generic Container', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/docker.svg', keywords: ['docker', 'container', 'containerize'] },
  { id: 'generic-kubernetes', name: 'Kubernetes', type: 'Generic Orchestration', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/kubernetes.svg', keywords: ['kubernetes', 'k8s', 'orchestration'] },
  { id: 'generic-rabbitmq', name: 'RabbitMQ', type: 'Generic Integration', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/rabbitmq.svg', keywords: ['rabbitmq', 'rabbit', 'queue', 'amqp'] },
  { id: 'generic-elasticsearch', name: 'Elasticsearch', type: 'Generic Search', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/a116a0e4e8_Elastic-Search.svg', keywords: ['elasticsearch', 'elastic', 'search', 'elk'] },
  { id: 'generic-mongodb', name: 'MongoDB', type: 'Generic Database', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/642e6a727d_MongoDB.svg', keywords: ['mongodb', 'mongo', 'nosql', 'document db'] },
  { id: 'generic-prometheus', name: 'Prometheus', type: 'Generic Monitoring', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/25572bec55_Prometheus.svg', keywords: ['prometheus', 'monitoring', 'metrics'] },
  { id: 'generic-grafana', name: 'Grafana', type: 'Generic Monitoring', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/b4c4109e46_Grafana.svg', keywords: ['grafana', 'dashboard', 'visualization'] },
  { id: 'generic-terraform', name: 'Terraform', type: 'Generic IaC', provider: 'generic', section: 'Generic', iconPath: '/Icons/generic/f200877f00_HashiCorp-Terraform.svg', keywords: ['terraform', 'infrastructure as code', 'iac', 'hcl'] },
];

const normalizeText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const resolvePrimitiveByText = (...candidates: Array<string | undefined | null>): PrimitiveItem | null => {
  const source = normalizeText(candidates.filter(Boolean).join(' '));
  if (!source) return null;

  const exact = PRIMITIVE_ITEMS.find((item) => {
    const name = normalizeText(item.name);
    return source.includes(name) || item.keywords.some((keyword) => source.includes(normalizeText(keyword)));
  });

  return exact || null;
};

export const iconForNode = (label?: string, type?: string): string => {
  return resolvePrimitiveByText(label, type)?.iconPath || DEFAULT_ARCHITECTURE_ICON;
};
