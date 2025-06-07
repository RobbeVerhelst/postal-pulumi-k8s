# Postal Mail Server - Pulumi Kubernetes Deployment

This repository contains a Pulumi project for deploying [Postal](https://docs.postalserver.io/), a complete and fully featured mail delivery platform, on Kubernetes. Postal is an open-source alternative to services like Sendgrid, Mailgun, or Postmark that you can run on your own servers.

## Features

- **Web Interface**: Complete web-based management interface
- **SMTP Server**: Full-featured SMTP server with TLS support
- **Background Workers**: Asynchronous job processing
- **Scalable**: Easily scale components independently
- **Kubernetes Native**: Deployed using Kubernetes best practices
- **Infrastructure as Code**: Managed with Pulumi for reproducible deployments

## Architecture

This deployment creates the following Kubernetes resources:

- **Namespace**: `postal` - Isolated namespace for all Postal components
- **Web Deployment**: Postal web interface (configurable replicas)
- **SMTP Deployment**: SMTP server for mail processing (configurable replicas)
- **Worker Deployment**: Background job workers (configurable replicas)
- **Services**: ClusterIP for web, LoadBalancer for SMTP
- **Ingress**: HTTPS access to the web interface
- **Secret**: Postal configuration and signing key
- **Job**: Database initialization

## Prerequisites

Before deploying Postal, ensure you have:

1. **Kubernetes Cluster**: A running Kubernetes cluster with:
   - Ingress controller (nginx recommended)
   - LoadBalancer support (for SMTP service)
   - Cert-manager (for TLS certificates)

2. **MySQL Database**: Postal requires a MySQL database. Set up:
   - MySQL 5.7+ or MariaDB 10.2+
   - Database and user with full privileges
   - Network access from your Kubernetes cluster

3. **Domain Configuration**: 
   - A domain for Postal (e.g., `postal.example.com`)
   - DNS A record pointing to your cluster's ingress
   - MX record pointing to your SMTP service IP

4. **Tools**:
   - [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
   - [kubectl](https://kubernetes.io/docs/tasks/tools/)
   - Node.js 16+

## Quick Start

### 1. Clone and Setup

```bash
git clone <this-repository>
cd postal
npm install
```

### 2. Initialize Pulumi Stack

```bash
# Create a new stack (or select existing)
pulumi stack init production

# Or select existing stack
pulumi stack select production
```

### 3. Configure the Stack

Run the interactive configuration script:

```bash
chmod +x setup-stack-config.sh
./setup-stack-config.sh
```

Or configure manually:

```bash
# Required configuration
pulumi config set kubeconfig ~/.kube/config
pulumi config set postal:domain postal.example.com
pulumi config set postal:mysql-host mysql.example.com
pulumi config set postal:mysql-database postal
pulumi config set postal:mysql-username postal_user
pulumi config set --secret postal:mysql-password your_mysql_password

# Generate and set signing key
openssl genrsa 2048 | pulumi config set --secret postal:signing-key

# Optional configuration (with defaults)
pulumi config set postal:image ghcr.io/postalserver/postal:3.3.4
pulumi config set postal:web-replicas 1
pulumi config set postal:smtp-replicas 1
pulumi config set postal:worker-replicas 1
pulumi config set postal:ingress-class nginx
pulumi config set postal:smtp-service-type LoadBalancer
```

### 4. Deploy

```bash
# Preview the deployment
pulumi preview

# Deploy to Kubernetes
pulumi up
```

### 5. Initialize Postal

After deployment, initialize the database and create an admin user:

```bash
# Initialize the database
kubectl exec -it deployment/postal-web -n postal -- postal initialize

# Create admin user (follow prompts)
kubectl exec -it deployment/postal-web -n postal -- postal make-user
```

### 6. Access Postal

- **Web Interface**: `https://your-postal-domain.com`
- **SMTP Server**: Your LoadBalancer IP on port 25

## Configuration Options

| Configuration Key | Description | Default | Required |
|------------------|-------------|---------|----------|
| `kubeconfig` | Path to kubeconfig file | - | ✅ |
| `postal:domain` | Postal domain name | - | ✅ |
| `postal:mysql-host` | MySQL host | - | ✅ |
| `postal:mysql-database` | MySQL database name | - | ✅ |
| `postal:mysql-username` | MySQL username | - | ✅ |
| `postal:mysql-password` | MySQL password | - | ✅ |
| `postal:signing-key` | RSA private key for signing | - | ✅ |
| `postal:image` | Postal container image | `ghcr.io/postalserver/postal:3.3.4` | ❌ |
| `postal:web-replicas` | Web component replicas | `1` | ❌ |
| `postal:smtp-replicas` | SMTP component replicas | `1` | ❌ |
| `postal:worker-replicas` | Worker component replicas | `1` | ❌ |
| `postal:ingress-class` | Ingress controller class | `nginx` | ❌ |
| `postal:smtp-service-type` | SMTP service type | `LoadBalancer` | ❌ |
| `postal:smtp-loadbalancer-ip` | Static IP for SMTP LoadBalancer | - | ❌ |

## DNS Configuration

For Postal to work correctly, configure these DNS records:

```dns
# A record for web interface
postal.example.com.     IN  A       <ingress-ip>

# MX record for mail delivery
example.com.            IN  MX  10  postal.example.com.

# SPF record
example.com.            IN  TXT     "v=spf1 include:postal.example.com ~all"

# DKIM record (generated by Postal)
<selector>._domainkey.example.com. IN TXT "v=DKIM1; k=rsa; p=<public-key>"
```

## Scaling

Scale individual components as needed:

```bash
# Scale web interface
pulumi config set postal:web-replicas 3

# Scale SMTP servers
pulumi config set postal:smtp-replicas 2

# Scale workers
pulumi config set postal:worker-replicas 5

# Apply changes
pulumi up
```

## Monitoring

Check deployment status:

```bash
# Check all pods
kubectl get pods -n postal

# Check services
kubectl get services -n postal

# Check ingress
kubectl get ingress -n postal

# View logs
kubectl logs -f deployment/postal-web -n postal
kubectl logs -f deployment/postal-smtp -n postal
kubectl logs -f deployment/postal-worker -n postal
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**:
   ```bash
   kubectl logs deployment/postal-web -n postal
   # Check MySQL connectivity and credentials
   ```

2. **Ingress Not Working**:
   ```bash
   kubectl describe ingress postal-web -n postal
   # Verify ingress controller and DNS configuration
   ```

3. **SMTP Service Not Accessible**:
   ```bash
   kubectl get service postal-smtp -n postal
   # Check LoadBalancer IP assignment
   ```

### Useful Commands

```bash
# Get SMTP service external IP
kubectl get service postal-smtp -n postal -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Access Postal console
kubectl exec -it deployment/postal-web -n postal -- postal console

# Check Postal status
kubectl exec -it deployment/postal-web -n postal -- postal status
```

## Security Considerations

- Store sensitive configuration as Pulumi secrets
- Use TLS certificates for web interface (cert-manager recommended)
- Configure proper firewall rules for SMTP access
- Regularly update Postal container images
- Monitor for security updates

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test the deployment
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## References

- [Postal Documentation](https://docs.postalserver.io/)
- [Postal GitHub Repository](https://github.com/postalserver/postal)
- [Pulumi Kubernetes Provider](https://www.pulumi.com/docs/intro/cloud-providers/kubernetes/)
- [Original Helm Chart PR](https://github.com/postalserver/install/pull/20)