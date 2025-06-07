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
set_config "postal:mysql-password" "MySQL password for Postal user" true
set_config "postal:signing-key" "Postal signing key (generate with: openssl genrsa 2048)" true

echo ""
echo "🗄️ MySQL Database Configuration:"
echo "================================"

# Ask about MySQL deployment
echo "📝 Deploy MySQL using Bitnami Helm chart? (default: true)"
current_value=$(pulumi config get "postal:deploy-mysql" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Deploy MySQL? (y/n, default: y): " deploy_mysql
    if [ "$deploy_mysql" = "n" ] || [ "$deploy_mysql" = "N" ]; then
        pulumi config set "postal:deploy-mysql" "false"
        echo "📝 External MySQL configuration required:"
        set_config "postal:mysql-host" "External MySQL host (e.g., mysql.example.com)"
        set_config "postal:mysql-database" "MySQL database name"
        set_config "postal:mysql-username" "MySQL username"
    else
        pulumi config set "postal:deploy-mysql" "true"
        set_config "postal:mysql-root-password" "MySQL root password" true
        echo "📝 MySQL database name (default: postal)"
        current_value=$(pulumi config get "postal:mysql-database" 2>/dev/null || echo "")
        if [ -z "$current_value" ]; then
            read -p "Enter value (or press Enter for default): " value
            if [ -n "$value" ]; then
                pulumi config set "postal:mysql-database" "$value"
            fi
        else
            echo "✅ postal:mysql-database is already set: $current_value"
        fi
        
        echo "📝 MySQL username (default: postal)"
        current_value=$(pulumi config get "postal:mysql-username" 2>/dev/null || echo "")
        if [ -z "$current_value" ]; then
            read -p "Enter value (or press Enter for default): " value
            if [ -n "$value" ]; then
                pulumi config set "postal:mysql-username" "$value"
            fi
        else
            echo "✅ postal:mysql-username is already set: $current_value"
        fi
    fi
else
    echo "✅ postal:deploy-mysql is already set: $current_value"
    if [ "$current_value" = "false" ]; then
        echo "📝 External MySQL configuration:"
        set_config "postal:mysql-host" "External MySQL host (e.g., mysql.example.com)"
        set_config "postal:mysql-database" "MySQL database name"
        set_config "postal:mysql-username" "MySQL username"
    else
        set_config "postal:mysql-root-password" "MySQL root password" true
    fi
fi

echo ""
echo "⚙️ Optional Configuration (press Enter to use defaults):"
echo "======================================================="

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

echo "📝 SMTP service type (default: LoadBalancer)"
current_value=$(pulumi config get "postal:smtp-service-type" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter for default): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:smtp-service-type" "$value"
    fi
else
    echo "✅ postal:smtp-service-type is already set: $current_value"
fi

echo "📝 SMTP LoadBalancer IP (optional, leave empty for auto-assignment)"
current_value=$(pulumi config get "postal:smtp-loadbalancer-ip" 2>/dev/null || echo "")
if [ -z "$current_value" ]; then
    read -p "Enter value (or press Enter to skip): " value
    if [ -n "$value" ]; then
        pulumi config set "postal:smtp-loadbalancer-ip" "$value"
    fi
else
    echo "✅ postal:smtp-loadbalancer-ip is already set: $current_value"
fi

# MySQL storage configuration (only if deploying MySQL)
deploy_mysql_value=$(pulumi config get "postal:deploy-mysql" 2>/dev/null || "true")
if [ "$deploy_mysql_value" = "true" ]; then
    echo ""
    echo "🗄️ MySQL Storage Configuration:"
    echo "==============================="
    
    echo "📝 MySQL storage size (default: 8Gi)"
    current_value=$(pulumi config get "postal:mysql-storage-size" 2>/dev/null || echo "")
    if [ -z "$current_value" ]; then
        read -p "Enter value (or press Enter for default): " value
        if [ -n "$value" ]; then
            pulumi config set "postal:mysql-storage-size" "$value"
        fi
    else
        echo "✅ postal:mysql-storage-size is already set: $current_value"
    fi
    
    echo "📝 MySQL storage class (optional, leave empty for default)"
    current_value=$(pulumi config get "postal:mysql-storage-class" 2>/dev/null || echo "")
    if [ -z "$current_value" ]; then
        read -p "Enter value (or press Enter to skip): " value
        if [ -n "$value" ]; then
            pulumi config set "postal:mysql-storage-class" "$value"
        fi
    else
        echo "✅ postal:mysql-storage-class is already set: $current_value"
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
if [ "$deploy_mysql_value" = "false" ]; then
    echo "2. Make sure your external MySQL database is set up and accessible"
else
    echo "2. MySQL will be deployed automatically with Postal"
fi
echo "3. Ensure your domain DNS is configured to point to your cluster"
echo "4. Run 'pulumi up' to deploy Postal"
echo "5. After deployment, run the initialization commands:"
echo "   kubectl exec -it deployment/postal-web -n postal -- postal initialize"
echo "   kubectl exec -it deployment/postal-web -n postal -- postal make-user"
echo ""
echo "📖 For more information, see the README.md file." 