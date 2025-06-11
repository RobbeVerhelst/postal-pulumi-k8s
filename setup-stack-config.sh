#!/bin/bash

# Postal Pulumi Stack Configuration Setup Script
# This script helps you configure the required settings for deploying Postal

set -e

echo "🏃‍♂️ Setting up Pulumi stack configuration for Postal..."

# Check if we're in a Pulumi project
if [ ! -f "Pulumi.yaml" ]; then
    echo "❌ Error: Not in a Pulumi project directory. Please run this from the project root."
    exit 1
fi

# Get current stack
STACK=$(pulumi stack --show-name 2>/dev/null || echo "")
if [ -z "$STACK" ]; then
    echo "❌ Error: No Pulumi stack selected. Please run 'pulumi stack select <stack-name>' first."
    exit 1
fi

echo "📋 Configuring stack: $STACK"

# Function to set config with prompt
set_config() {
    local key=$1
    local description=$2
    local secret=${3:-false}
    local current_value

    if [ "$secret" = "true" ]; then
        current_value=$(pulumi config get "$key" 2>/dev/null || echo "")
        if [ -n "$current_value" ]; then
            echo "✅ $key is already set (secret)"
            return
        fi
        echo "🔐 $description"
        read -s -p "Enter value: " value
        echo
        pulumi config set --secret "$key" "$value"
    else
        current_value=$(pulumi config get "$key" 2>/dev/null || echo "")
        if [ -n "$current_value" ]; then
            echo "✅ $key is already set: $current_value"
            return
        fi
        echo "📝 $description"
        read -p "Enter value: " value
        pulumi config set "$key" "$value"
    fi
}

echo ""
echo "🔧 Required Configuration:"
echo "========================="

# Kubernetes configuration
set_config "kubeconfig" "Path to your kubeconfig file (e.g., ~/.kube/config)"

# Postal configuration
set_config "postal:domain" "Your Postal domain (e.g., postal.example.com)"
set_config "postal:mariadb-password" "MariaDB password for Postal user" true
set_config "postal:mariadb-root-password" "MariaDB root password" true
set_config "postal:signing-key" "Postal signing key (generate with: openssl genrsa 2048)" true

echo ""
echo "🗄️ MariaDB Database Configuration:"
echo "=================================="

# Ask about MariaDB deployment
echo "📝 Deploy MariaDB using custom component? (default: true)"
current_value=$(pulumi config get "postal:deploy-mariadb" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Deploy MariaDB? (y/n, default: y): " deploy_mariadb
    if [ "$deploy_mariadb" = "n" ] || [ "$deploy_mariadb" = "N" ]; then
        pulumi config set "postal:deploy-mariadb" "false"
        echo "📝 External MariaDB configuration required:"
        set_config "postal:mariadb-host" "External MariaDB host (e.g., mariadb.example.com)"
        set_config "postal:mariadb-database" "MariaDB database name"
        set_config "postal:mariadb-username" "MariaDB username"
    else
        pulumi config set "postal:deploy-mariadb" "true"
        echo "📝 MariaDB database name (default: postal)"
        current_value=$(pulumi config get "postal:mariadb-database" 2>/dev/null || echo "")
        if [ -z "$current_value" ]; then
            read -p "Enter value (or press Enter for default): " value
            if [ -n "$value" ]; then
                pulumi config set "postal:mariadb-database" "$value"
            fi
        else
            echo "✅ postal:mariadb-database is already set: $current_value"
        fi
        
        echo "📝 MariaDB username (default: postal)"
        current_value=$(pulumi config get "postal:mariadb-username" 2>/dev/null || echo "")
        if [ -z "$current_value" ]; then
            read -p "Enter value (or press Enter for default): " value
            if [ -n "$value" ]; then
                pulumi config set "postal:mariadb-username" "$value"
            fi
        else
            echo "✅ postal:mariadb-username is already set: $current_value"
        fi
    fi
else
    echo "✅ postal:deploy-mariadb is already set: $current_value"
    if [ "$current_value" = "false" ]; then
        echo "📝 External MariaDB configuration:"
        set_config "postal:mariadb-host" "External MariaDB host (e.g., mariadb.example.com)"
        set_config "postal:mariadb-database" "MariaDB database name"
        set_config "postal:mariadb-username" "MariaDB username"
    fi
fi

echo ""
echo "⚙️ Optional Configuration (press Enter to use defaults):"
echo "======================================================="

# Rails secret key (new optional configuration)
echo "📝 Custom Rails secret key (optional, secure default will be used if not set)"
current_value=$(pulumi config get "postal:rails-secret-key" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -s -p "Enter custom Rails secret key (or press Enter to use secure default): " value
    echo
    if [ -n "$value" ]; then
        pulumi config set --secret "postal:rails-secret-key" "$value"
    fi
else
    echo "✅ postal:rails-secret-key is already set (secret)"
fi

# Optional configurations with defaults
echo "📝 Postal container image (default: ghcr.io/postalserver/postal:3.3.4)"
current_value=$(pulumi config get "postal:image" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:image" "$value"
    fi
else
    echo "✅ postal:image is already set: $current_value"
fi

echo "📝 Web replicas (default: 1)"
current_value=$(pulumi config get "postal:web-replicas" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:web-replicas" "$value"
    fi
else
    echo "✅ postal:web-replicas is already set: $current_value"
fi

echo "📝 SMTP replicas (default: 1)"
current_value=$(pulumi config get "postal:smtp-replicas" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:smtp-replicas" "$value"
    fi
else
    echo "✅ postal:smtp-replicas is already set: $current_value"
fi

echo "📝 Worker replicas (default: 1)"
current_value=$(pulumi config get "postal:worker-replicas" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:worker-replicas" "$value"
    fi
else
    echo "✅ postal:worker-replicas is already set: $current_value"
fi

echo "📝 Deploy ingress? (default: false)"
current_value=$(pulumi config get "postal:deploy-ingress" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Deploy ingress? (y/n, default: n): " deploy_ingress
    if [ "$deploy_ingress" = "y" ] || [ "$deploy_ingress" = "Y" ]; then
        pulumi config set "postal:deploy-ingress" "true"
        echo "📝 Ingress class (default: nginx)"
        read -p "Enter value (or press Enter for default): " value
        if [ -n "$value" ]; then
            pulumi config set "postal:ingress-class" "$value"
        fi
    else
        pulumi config set "postal:deploy-ingress" "false"
    fi
else
    echo "✅ postal:deploy-ingress is already set: $current_value"
    if [ "$current_value" = "true" ]; then
        echo "📝 Ingress class (default: nginx)"
        current_value=$(pulumi config get "postal:ingress-class" 2>/dev/null || echo "")
        if [ -z "$current_value" ]; then
            read -p "Enter value (or press Enter for default): " value
            if [ -n "$value" ]; then
                pulumi config set "postal:ingress-class" "$value"
            fi
        else
            echo "✅ postal:ingress-class is already set: $current_value"
        fi
    fi
fi

echo "📝 SMTP service type (default: ClusterIP)"
current_value=$(pulumi config get "postal:smtp-service-type" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (ClusterIP/NodePort/LoadBalancer, or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:smtp-service-type" "$value"
    fi
else
    echo "✅ postal:smtp-service-type is already set: $current_value"
fi

echo "📝 SMTP LoadBalancer IP (optional, only for LoadBalancer service type)"
current_value=$(pulumi config get "postal:smtp-loadbalancer-ip" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter to skip): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:smtp-loadbalancer-ip" "$value"
    fi
else
    echo "✅ postal:smtp-loadbalancer-ip is already set: $current_value"
fi

# MariaDB storage configuration (only if deploying MariaDB)
deploy_mariadb_value=$(pulumi config get "postal:deploy-mariadb" 2>/dev/null || "true")
if [ "$deploy_mariadb_value" = "true" ]; then
    echo ""
    echo "🗄️ MariaDB Storage Configuration:"
    echo "================================="
    
    echo "📝 MariaDB storage size (default: 8Gi)"
    current_value=$(pulumi config get "postal:mariadb-storage-size" 2>/dev/null || echo "")
    if [ -z "$current_value" ]; then
        read -p "Enter value (or press Enter for default): " value
        if [ -n "$value" ]; then
            pulumi config set "postal:mariadb-storage-size" "$value"
        fi
    else
        echo "✅ postal:mariadb-storage-size is already set: $current_value"
    fi
    
    echo "📝 MariaDB storage class (optional, leave empty for default)"
    current_value=$(pulumi config get "postal:mariadb-storage-class" 2>/dev/null || echo "")
    if [ -z "$current_value" ]; then
        read -p "Enter value (or press Enter to skip): " value
        if [ -n "$value" ]; then
            pulumi config set "postal:mariadb-storage-class" "$value"
        fi
    else
        echo "✅ postal:mariadb-storage-class is already set: $current_value"
    fi
fi

echo ""
echo "✅ Configuration complete!"
echo ""
echo "📋 Current configuration:"
pulumi config

echo ""
echo "🚀 Next steps:"
echo "1. Review your configuration above"
if [ "$deploy_mariadb_value" = "false" ]; then
    echo "2. Make sure your external MariaDB database is set up and accessible"
else
    echo "2. MariaDB will be deployed automatically with Postal"
    echo "   - Includes automatic mail server database permissions"
    echo "   - Uses mariadb:10.11 image (Postal requirement)"
fi
echo "3. Ensure your domain DNS is configured to point to your cluster"
echo "4. Run 'pulumi up' to deploy Postal"
echo "5. After deployment, access the web interface at https://your-domain"
echo "   - Default admin user: admin@your-domain"
echo "   - Default password: PostalAdmin123!"
echo ""
echo "📖 For more information, see the README.md file." 