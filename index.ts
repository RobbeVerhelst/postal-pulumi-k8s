import { Config, getStack } from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { Namespace } from "@pulumi/kubernetes/core/v1";
import { Release } from "@pulumi/kubernetes/helm/v3";
import * as k8s from "@pulumi/kubernetes";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Get stack name and configuration
const stack = getStack();
const config = new Config();

// Required configuration
const kubeconfig = config.require("kubeconfig");

// Postal configuration
const postalConfig = new Config("postal");
const postalDomain = postalConfig.require("domain"); // e.g., "postal.example.com"

// MySQL configuration - now optional since we're deploying MySQL
const mysqlHost = postalConfig.get("mysql-host") || "postal-mysql";
const mysqlDatabase = postalConfig.get("mysql-database") || "postal";
const mysqlUsername = postalConfig.get("mysql-username") || "postal";
const mysqlPassword = postalConfig.requireSecret("mysql-password");
const signingKey = postalConfig.requireSecret("signing-key");

// MySQL deployment configuration
const deployMysql = postalConfig.getBoolean("deploy-mysql") ?? true;
const mysqlRootPassword = postalConfig.requireSecret("mysql-root-password");
const mysqlStorageSize = postalConfig.get("mysql-storage-size") || "8Gi";
const mysqlStorageClass = postalConfig.get("mysql-storage-class") || "";

// Optional configuration with defaults
const postalImage = postalConfig.get("image") || "ghcr.io/postalserver/postal:3.3.4";
const webReplicas = parseInt(postalConfig.get("web-replicas") || "1");
const smtpReplicas = parseInt(postalConfig.get("smtp-replicas") || "1");
const workerReplicas = parseInt(postalConfig.get("worker-replicas") || "1");
const ingressClass = postalConfig.get("ingress-class") || "nginx";
const smtpServiceTypeConfig = postalConfig.get("smtp-service-type") || "LoadBalancer";
const smtpLoadBalancerIP = postalConfig.get("smtp-loadbalancer-ip") || "";

// Kubernetes provider
const k8sProvider = new Provider("k8s-provider", {
    kubeconfig: kubeconfig,
});

// ============================================================================
// NAMESPACE
// ============================================================================

const postalNamespace = new Namespace("postal-ns", {
    metadata: { name: "postal" },
}, { provider: k8sProvider });

// ============================================================================
// MYSQL DEPLOYMENT (BITNAMI HELM CHART)
// ============================================================================

let mysqlRelease: Release | undefined;

if (deployMysql) {
    mysqlRelease = new Release("postal-mysql", {
        name: "postal-mysql",
        chart: "mysql",
        version: "11.1.19", // Latest stable version as of 2024
        repositoryOpts: {
            repo: "https://charts.bitnami.com/bitnami",
        },
        namespace: postalNamespace.metadata.name,
        values: {
            // MySQL configuration
            auth: {
                rootPassword: mysqlRootPassword,
                database: mysqlDatabase,
                username: mysqlUsername,
                password: mysqlPassword,
            },
            // MySQL image configuration
            image: {
                tag: "8.0.40-debian-12-r0", // Stable MySQL 8.0 version
            },
            // Architecture
            architecture: "standalone",
            // Primary configuration
            primary: {
                persistence: {
                    enabled: true,
                    size: mysqlStorageSize,
                    ...(mysqlStorageClass && { storageClass: mysqlStorageClass }),
                },
                resources: {
                    limits: {
                        memory: "1Gi",
                        cpu: "1000m"
                    },
                    requests: {
                        memory: "512Mi",
                        cpu: "250m"
                    }
                },
                configuration: `
[mysqld]
default_authentication_plugin=mysql_native_password
skip-name-resolve
explicit_defaults_for_timestamp
basedir=/opt/bitnami/mysql
plugin_dir=/opt/bitnami/mysql/lib/plugin
port=3306
socket=/opt/bitnami/mysql/tmp/mysql.sock
datadir=/bitnami/mysql/data
tmpdir=/opt/bitnami/mysql/tmp
max_allowed_packet=16M
bind-address=*
pid-file=/opt/bitnami/mysql/tmp/mysqld.pid
log-error=/opt/bitnami/mysql/logs/mysqld.log
character-set-server=UTF8
collation-server=utf8_general_ci
slow_query_log=0
slow_query_log_file=/opt/bitnami/mysql/logs/mysqld.log
long_query_time=10.0

[client]
port=3306
socket=/opt/bitnami/mysql/tmp/mysql.sock
default-character-set=UTF8
plugin_dir=/opt/bitnami/mysql/lib/plugin

[manager]
port=3306
socket=/opt/bitnami/mysql/tmp/mysql.sock
pid-file=/opt/bitnami/mysql/tmp/mysqld.pid
`,
            },
            // Service configuration
            service: {
                type: "ClusterIP",
                ports: {
                    mysql: 3306
                }
            },
            // Metrics (optional)
            metrics: {
                enabled: false,
            },
        },
    }, { provider: k8sProvider, dependsOn: [postalNamespace] });
}

// ============================================================================
// POSTAL CONFIGURATION
// ============================================================================

// Generate the postal.yml configuration
const postalYmlConfig = {
    web: {
        host: `https://${postalDomain}`,
        protocol: "https"
    },
    general: {
        use_ip_pools: true
    },
    database: {
        host: mysqlHost,
        username: mysqlUsername,
        password: mysqlPassword,
        database: mysqlDatabase,
        pool_size: 5
    },
    smtp_server: {
        port: 25,
        tls_enabled: true,
        tls_certificate_path: "/config/smtp.crt",
        tls_private_key_path: "/config/smtp.key",
        ssl_version: "TLSv1_2",
        ssl_ciphers: "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256"
    },
    dns: {
        mx_records: [`10 ${postalDomain}`],
        smtp_server_hostname: postalDomain,
        spf_include: postalDomain,
        return_path: postalDomain,
        route_domain: postalDomain,
        track_domain: postalDomain
    },
    smtp: {
        host: "127.0.0.1",
        port: 2525,
        username: "", // Complete when Postal is running
        password: "", // Complete when Postal is running
        from_name: "Postal",
        from_address: postalDomain
    },
    rails: {
        secret_key: "f1e4a061c0f3894a65d0335ce9d56ffa16c8b4d8dd2a101d875f703358790fc69b5a27f854dfff895b6d86cb9994ed8506e0cdec1a2cd5a1c840bf98b47431cd08de05e33a12f53219dcb795e4d72685647b40eb707555c242a1facc40b19c4cd3a35b0ca91507a672d3f7bce48a0dad81c930320001b22ba6fdc468f9a8ce08"
    },
    web_server: {
        default_bind_address: "0.0.0.0"
    }
};

// Create Secret for Postal configuration
const postalSecret = new k8s.core.v1.Secret("postal-secret", {
    metadata: {
        name: "postal-config",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    data: {
        "postal.yml": Buffer.from(JSON.stringify(postalYmlConfig, null, 2)).toString("base64"),
        "signing.key": signingKey.apply((key: string) => Buffer.from(key).toString("base64"))
    }
}, { 
    provider: k8sProvider, 
    dependsOn: mysqlRelease ? [postalNamespace, mysqlRelease] : [postalNamespace]
});

// ============================================================================
// WEB DEPLOYMENT
// ============================================================================

const webDeployment = new k8s.apps.v1.Deployment("postal-web", {
    metadata: {
        name: "postal-web",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "web",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        replicas: webReplicas,
        selector: {
            matchLabels: {
                app: "postal",
                component: "web",
                release: "postal"
            }
        },
        template: {
            metadata: {
                labels: {
                    app: "postal",
                    component: "web",
                    release: "postal"
                }
            },
            spec: {
                containers: [{
                    name: "postal-web",
                    image: postalImage,
                    command: ["postal", "run"],
                    ports: [{
                        containerPort: 5000,
                        name: "http"
                    }],
                    env: [{
                        name: "POSTAL_CONFIG_ROOT",
                        value: "/config"
                    }],
                    volumeMounts: [{
                        name: "config",
                        mountPath: "/config"
                    }],
                    livenessProbe: {
                        httpGet: {
                            path: "/",
                            port: "http"
                        },
                        initialDelaySeconds: 30,
                        periodSeconds: 10
                    },
                    readinessProbe: {
                        httpGet: {
                            path: "/",
                            port: "http"
                        },
                        initialDelaySeconds: 5,
                        periodSeconds: 5
                    }
                }],
                volumes: [{
                    name: "config",
                    secret: {
                        secretName: postalSecret.metadata.name
                    }
                }]
            }
        }
    }
}, { provider: k8sProvider, dependsOn: [postalSecret] });

// Web Service
const webService = new k8s.core.v1.Service("postal-web-service", {
    metadata: {
        name: "postal-web",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "web",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        type: "ClusterIP",
        ports: [{
            port: 80,
            targetPort: "http",
            protocol: "TCP",
            name: "http"
        }],
        selector: {
            app: "postal",
            component: "web",
            release: "postal"
        }
    }
}, { provider: k8sProvider, dependsOn: [webDeployment] });

// Web Ingress
const webIngress = new k8s.networking.v1.Ingress("postal-web-ingress", {
    metadata: {
        name: "postal-web",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "web",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        },
        annotations: {
            "kubernetes.io/tls-acme": "true",
            "kubernetes.io/ingress.class": ingressClass
        }
    },
    spec: {
        ingressClassName: ingressClass,
        tls: [{
            secretName: "postal-web-tls",
            hosts: [postalDomain]
        }],
        rules: [{
            host: postalDomain,
            http: {
                paths: [{
                    path: "/",
                    pathType: "ImplementationSpecific",
                    backend: {
                        service: {
                            name: webService.metadata.name,
                            port: {
                                number: 80
                            }
                        }
                    }
                }]
            }
        }]
    }
}, { provider: k8sProvider, dependsOn: [webService] });

// ============================================================================
// SMTP DEPLOYMENT
// ============================================================================

const smtpDeployment = new k8s.apps.v1.Deployment("postal-smtp", {
    metadata: {
        name: "postal-smtp",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "smtp",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        replicas: smtpReplicas,
        selector: {
            matchLabels: {
                app: "postal",
                component: "smtp",
                release: "postal"
            }
        },
        template: {
            metadata: {
                labels: {
                    app: "postal",
                    component: "smtp",
                    release: "postal"
                }
            },
            spec: {
                containers: [{
                    name: "postal-smtp",
                    image: postalImage,
                    command: ["postal", "smtp-server"],
                    ports: [{
                        containerPort: 25,
                        name: "smtp"
                    }],
                    env: [{
                        name: "POSTAL_CONFIG_ROOT",
                        value: "/config"
                    }],
                    volumeMounts: [{
                        name: "config",
                        mountPath: "/config"
                    }],
                    livenessProbe: {
                        tcpSocket: {
                            port: "smtp"
                        },
                        initialDelaySeconds: 30,
                        periodSeconds: 10
                    },
                    readinessProbe: {
                        tcpSocket: {
                            port: "smtp"
                        },
                        initialDelaySeconds: 5,
                        periodSeconds: 5
                    }
                }],
                volumes: [{
                    name: "config",
                    secret: {
                        secretName: postalSecret.metadata.name
                    }
                }]
            }
        }
    }
}, { provider: k8sProvider, dependsOn: [postalSecret] });

// SMTP Service
const smtpService = new k8s.core.v1.Service("postal-smtp-service", {
    metadata: {
        name: "postal-smtp",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "smtp",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        type: smtpServiceTypeConfig as any,
        ...(smtpLoadBalancerIP && { loadBalancerIP: smtpLoadBalancerIP }),
        ports: [{
            port: 25,
            targetPort: "smtp",
            protocol: "TCP",
            name: "smtp"
        }],
        selector: {
            app: "postal",
            component: "smtp",
            release: "postal"
        }
    }
}, { provider: k8sProvider, dependsOn: [smtpDeployment] });

// ============================================================================
// WORKER DEPLOYMENT
// ============================================================================

const workerDeployment = new k8s.apps.v1.Deployment("postal-worker", {
    metadata: {
        name: "postal-worker",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "worker",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        replicas: workerReplicas,
        selector: {
            matchLabels: {
                app: "postal",
                component: "worker",
                release: "postal"
            }
        },
        template: {
            metadata: {
                labels: {
                    app: "postal",
                    component: "worker",
                    release: "postal"
                }
            },
            spec: {
                containers: [{
                    name: "postal-worker",
                    image: postalImage,
                    command: ["postal", "worker"],
                    env: [{
                        name: "POSTAL_CONFIG_ROOT",
                        value: "/config"
                    }],
                    volumeMounts: [{
                        name: "config",
                        mountPath: "/config"
                    }],
                    livenessProbe: {
                        exec: {
                            command: ["pgrep", "-f", "postal worker"]
                        },
                        initialDelaySeconds: 30,
                        periodSeconds: 10
                    }
                }],
                volumes: [{
                    name: "config",
                    secret: {
                        secretName: postalSecret.metadata.name
                    }
                }]
            }
        }
    }
}, { provider: k8sProvider, dependsOn: [postalSecret] });

// ============================================================================
// INITIALIZATION JOB
// ============================================================================

const initJob = new k8s.batch.v1.Job("postal-init", {
    metadata: {
        name: "postal-init",
        namespace: postalNamespace.metadata.name,
        labels: {
            app: "postal",
            component: "init",
            chart: "postal-1.0.0",
            release: "postal",
            heritage: "Pulumi"
        }
    },
    spec: {
        template: {
            spec: {
                restartPolicy: "OnFailure",
                containers: [{
                    name: "postal-init",
                    image: postalImage,
                    command: ["sh", "-c", "postal initialize && postal make-user"],
                    env: [{
                        name: "POSTAL_CONFIG_ROOT",
                        value: "/config"
                    }],
                    volumeMounts: [{
                        name: "config",
                        mountPath: "/config"
                    }]
                }],
                volumes: [{
                    name: "config",
                    secret: {
                        secretName: postalSecret.metadata.name
                    }
                }]
            }
        }
    }
}, { provider: k8sProvider, dependsOn: [postalSecret] });

// ============================================================================
// EXPORTS
// ============================================================================

export const namespaceName = postalNamespace.metadata.name;
export const webUrl = `https://${postalDomain}`;
export const smtpServiceName = smtpService.metadata.name;
export const smtpServiceType = smtpService.spec.type;
export const mysqlServiceName = mysqlRelease ? "postal-mysql" : "external-mysql";
export const mysqlEndpoint = mysqlRelease ? "postal-mysql.postal.svc.cluster.local:3306" : `${mysqlHost}:3306`;