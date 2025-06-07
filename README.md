# Postal Mail Server - Pulumi Kubernetes Deployment

This repository contains a Pulumi project for deploying [Postal](https://docs.postalserver.io/), a complete and fully featured mail delivery platform, on Kubernetes. Postal is an open-source alternative to services like Sendgrid, Mailgun, or Postmark that you can run on your own servers.

## Features

- **Web Interface**: Complete web-based management interface
- **SMTP Server**: Full-featured SMTP server with TLS support
- **Background Workers**: Asynchronous job processing
- **Integrated MySQL**: Bitnami MySQL Helm chart deployment (or external MySQL support)
- **Scalable**: Easily scale components independently
- **Kubernetes Native**: Deployed using Kubernetes best practices
- **Infrastructure as Code**: Managed with Pulumi for reproducible deployments

## Architecture

This deployment creates the following Kubernetes resources:

### Core Components
- **Namespace**: `postal` - Isolated namespace for all Postal resources
- **Web Deployment**: Postal web interface with ingress and TLS termination
- **SMTP Deployment**: Mail server with LoadBalancer service for external access
- **Worker Deployment**: Background job processing for email delivery
- **Init Job**: Database initialization and user creation

### Database Options
- **Integrated MySQL**: Bitnami MySQL Helm chart (default)
  - Persistent storage with configurable size and storage class
  - Optimized configuration for Postal
  - Automatic backup and monitoring capabilities
- **External MySQL**: Support for existing MySQL instances

### Networking
- **Ingress**: HTTPS access to web interface with automatic TLS certificates
- **LoadBalancer**: Direct SMTP access on port 25
- **Internal Services**: ClusterIP services for inter-component communication

## Prerequisites

- Kubernetes cluster (1.19+)
- Pulumi CLI installed
- kubectl configured to access your cluster
- Ingress controller (nginx recommended)
- Cert-manager for automatic TLS certificates (optional but recommended)

## Quick Start

1. **Clone and setup**:
   ```bash
   git clone <this-repo>
   cd postal
   npm install
   ```

2. **Initialize Pulumi stack**:
   ```bash
   pulumi stack init production
   ```

3. **Configure the deployment**:
   ```bash
   ./setup-stack-config.sh
   ```
   This interactive script will guide you through all required configuration.

4. **Deploy**:
   ```bash
   pulumi up
   ```

5. **Initialize Postal** (after deployment completes):
   ```bash
   kubectl exec -it deployment/postal-web -n postal -- postal initialize
   kubectl exec -it deployment/postal-web -n postal -- postal make-user
   ```

## Configuration

### Required Configuration

| Key | Description | Example |
|-----|-------------|---------|
| `kubeconfig` | Path to kubeconfig file | `~/.kube/config` |
| `postal:domain` | Your Postal domain | `postal.example.com` |
| `postal:mysql-password` | MySQL password for Postal user | `secure-password` |
| `postal:signing-key` | RSA private key for signing | Generate with `openssl genrsa 2048` |

### MySQL Configuration

#### Integrated MySQL (Default)
| Key | Description | Default |
|-----|-------------|---------|
| `postal:deploy-mysql` | Deploy MySQL using Bitnami chart | `true` |
| `postal:mysql-root-password` | MySQL root password | Required |
| `postal:mysql-database` | Database name | `postal` |
| `postal:mysql-username` | Database username | `postal` |
| `postal:mysql-storage-size` | Persistent volume size | `8Gi` |
| `postal:mysql-storage-class` | Storage class | Default cluster storage class |

#### External MySQL
Set `postal:deploy-mysql` to `false` and configure:
| Key | Description | Example |
|-----|-------------|---------|
| `postal:mysql-host` | MySQL server hostname | `mysql.example.com` |
| `postal:mysql-database` | Database name | `postal` |
| `postal:mysql-username` | Database username | `postal_user` |

### Optional Configuration

| Key | Description | Default |
|-----|-------------|---------|
| `postal:image` | Postal container image | `ghcr.io/postalserver/postal:3.3.4` |
| `postal:web-replicas` | Web component replicas | `1` |
| `postal:smtp-replicas` | SMTP component replicas | `1` |
| `postal:worker-replicas` | Worker component replicas | `1` |
| `postal:ingress-class` | Ingress controller class | `nginx` |
| `postal:smtp-service-type` | SMTP service type | `LoadBalancer` |
| `postal:smtp-loadbalancer-ip` | Static IP for SMTP LoadBalancer | Auto-assigned |

## DNS Configuration

Configure your domain's DNS records:

```
# A record for web interface
postal.example.com.     A    <ingress-ip>

# MX record for mail delivery
example.com.           MX   10 postal.example.com.

# SPF record
example.com.           TXT  "v=spf1 include:postal.example.com ~all"

# DKIM record (get from Postal web interface after setup)
default._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=<public-key>"
```

## Post-Deployment Setup

1. **Access the web interface**: `https://postal.example.com`
2. **Create your first organization and mail server**
3. **Configure DNS records** as shown in the Postal interface
4. **Set up DKIM signing** for your domains
5. **Configure IP pools** if needed
6. **Test email delivery**

## Scaling

Scale individual components:

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

The deployment includes:
- **Liveness probes**: Automatic restart of unhealthy containers
- **Readiness probes**: Traffic routing only to ready containers
- **Resource limits**: Prevent resource exhaustion
- **MySQL metrics**: Optional Prometheus metrics (set `metrics.enabled: true` in MySQL values)

## Backup

### MySQL Backup
If using integrated MySQL:
```bash
# Create backup
kubectl exec -it postal-mysql-0 -n postal -- mysqldump -u root -p postal > postal-backup.sql

# Restore backup
kubectl exec -i postal-mysql-0 -n postal -- mysql -u root -p postal < postal-backup.sql
```

### Configuration Backup
```bash
# Export Pulumi configuration
pulumi config --show-secrets > postal-config-backup.yaml
```

## Troubleshooting

### Common Issues

1. **MySQL connection errors**: Check if MySQL is ready and credentials are correct
2. **Ingress not working**: Verify ingress controller is installed and domain DNS is configured
3. **SMTP not accessible**: Check LoadBalancer service and firewall rules
4. **Pods not starting**: Check resource limits and node capacity

### Useful Commands

```bash
# Check pod status
kubectl get pods -n postal

# View logs
kubectl logs -f deployment/postal-web -n postal
kubectl logs -f deployment/postal-smtp -n postal
kubectl logs -f deployment/postal-worker -n postal

# Access MySQL
kubectl exec -it postal-mysql-0 -n postal -- mysql -u root -p

# Check services
kubectl get svc -n postal

# Check ingress
kubectl get ingress -n postal
```

## Security Considerations

- **TLS Encryption**: All web traffic is encrypted with automatic certificates
- **Network Policies**: Consider implementing network policies for additional isolation
- **RBAC**: Use Kubernetes RBAC to limit access to Postal resources
- **Secrets Management**: All sensitive data is stored in Kubernetes secrets
- **MySQL Security**: Root password and user passwords are encrypted at rest

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test the deployment
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- [Postal Documentation](https://docs.postalserver.io/)
- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

For issues with this deployment, please open a GitHub issue.