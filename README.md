# Postal Mail Server on Kubernetes with Pulumi

[![CI - Build, Lint & Validate](https://github.com/RobbeVerhelst/postal-pulumi-k8s/actions/workflows/validate.yml/badge.svg)](https://github.com/RobbeVerhelst/postal-pulumi-k8s/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Pulumi](https://img.shields.io/badge/Pulumi-8A3391?logo=pulumi&logoColor=white)](https://www.pulumi.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io/)

Deploy [Postal](https://docs.postalserver.io/) mail server on Kubernetes using Pulumi Infrastructure as Code. This project provides a production-ready, self-hosted alternative to services like Sendgrid, Mailgun, or Postmark.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/RobbeVerhelst/postal-pulumi-k8s.git
cd postal-pulumi-k8s

# Install dependencies
npm install

# Login to Pulumi (uses local file backend, no account needed)
pulumi login --local

# Configure and deploy
pulumi stack init production
./setup-stack-config.sh
pulumi up
```

**Result**: A complete mail server with a web interface, SMTP server, and MariaDB backend will be running on your Kubernetes cluster!

## Features

-   **Web Interface**: Complete web-based management interface.
-   **SMTP Server**: Full-featured SMTP server with TLS support.
-   **Background Workers**: Asynchronous job processing for email delivery.
-   **Integrated MariaDB**: Custom MariaDB component with automatic database permissions.
-   **Scalable**: Easily scale individual components (`web`, `smtp`, `worker`) as needed.
-   **Kubernetes Native**: Deploys using standard Kubernetes resources.
-   **Infrastructure as Code**: Managed with Pulumi for reproducible deployments.
-   **CI Ready**: GitHub Actions workflow for automated testing and validation.
-   **Production Ready**: Enterprise-grade code quality with strict TypeScript checking.

## Architecture

This deployment creates the following Kubernetes resources:

### Core Components
- **Namespace**: `postal` - Isolated namespace for all Postal resources
- **MariaDB**: Custom MariaDB component with automatic mail server database permissions
- **Web Deployment**: Postal web interface (port 5000) with Cloudflare tunnel support
- **SMTP Deployment**: Mail server (port 25) with configurable service type
- **Worker Deployment**: Background job processing for email delivery
- **Init Job**: Automatic database initialization and admin user creation

### Clean Architecture
- **Organized Structure**: TypeScript source files in `src/` directory
- **Modular Components**: Separate reusable components for MariaDB and Postal
- **Type Safety**: Strict TypeScript with comprehensive compiler checks
- **Specific Imports**: Optimized imports for better tree shaking and smaller bundles
- **Configuration Management**: Typed interfaces for all configuration sections

## CI Pipeline

The repository includes a comprehensive CI pipeline that runs automatically on every push and pull request:

### Automated Checks
- **Build & Lint**: TypeScript compilation and strict linting
- **Pulumi Validation**: Syntax validation with fake credentials (no infrastructure required)
- **Security Checks**: Dependency audit and hardcoded secret detection
- **Code Quality**: TODO/FIXME detection and console statement checks

### Smart Validation
The CI pipeline cleverly validates your Pulumi program without needing real infrastructure:
- Creates temporary stack with fake credentials
- Validates TypeScript compilation and Pulumi syntax
- Runs security audits and code quality checks
- Provides fast feedback in ~3-5 minutes
- Uses zero cloud resources for testing

No setup required - the CI runs automatically and doesn't need any secrets or configuration!

## Prerequisites

-   A Kubernetes cluster (v1.19+).
-   The [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/).
-   `kubectl` configured to access your cluster.
-   An Ingress controller (e.g., `nginx-ingress`) if you plan to use ingress.
-   The `openssl` command-line tool to generate the signing key.

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
   
   Alternatively, copy the example configuration:
   ```bash
   cp Pulumi.example.yaml Pulumi.production.yaml
   # Edit Pulumi.production.yaml with your values
   ```

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
| `postal:mariadb-password` | MariaDB password for Postal user | `secure-password` |
| `postal:mariadb-root-password` | MariaDB root password | `secure-root-password` |
| `postal:signing-key` | RSA private key for signing | Generate with `openssl genrsa 2048` |

### MariaDB Configuration

#### Integrated MariaDB (Default)
| Key | Description | Default |
|-----|-------------|---------|
| `postal:deploy-mariadb` | Deploy MariaDB using custom component | `true` |
| `postal:mariadb-database` | Database name | `postal` |
| `postal:mariadb-username` | Database username | `postal` |
| `postal:mariadb-storage-size` | Persistent volume size | `8Gi` |
| `postal:mariadb-storage-class` | Storage class | Default cluster storage class |

#### External MariaDB
Set `postal:deploy-mariadb` to `false` and configure:
| Key | Description | Example |
|-----|-------------|---------|
| `postal:mariadb-host` | MariaDB server hostname | `mariadb.example.com` |
| `postal:mariadb-database` | Database name | `postal` |
| `postal:mariadb-username` | Database username | `postal_user` |

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
| `postal:rails-secret-key` | Custom Rails secret key (optional) | Auto-generated secure default |

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

### MariaDB Backup
If using integrated MariaDB:
```bash
# Create backup
kubectl exec -it deployment/postal-mariadb-deployment -n postal -- mysqldump -u root -p postal > postal-backup.sql

# Restore backup
kubectl exec -i deployment/postal-mariadb-deployment -n postal -- mysql -u root -p postal < postal-backup.sql
```

### Configuration Backup
```bash
# Export Pulumi configuration
pulumi config --show-secrets > postal-config-backup.yaml
```

## Troubleshooting

### Common Issues

1. **MariaDB connection errors**: Check if MariaDB is ready and credentials are correct
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

# Access MariaDB
kubectl exec -it deployment/postal-mariadb-deployment -n postal -- mysql -u root -p

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
- **MariaDB Security**: Root password and user passwords are encrypted at rest
- **Configuration Security**: Stack configuration files (Pulumi.*.yaml) are excluded from git to protect secrets

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