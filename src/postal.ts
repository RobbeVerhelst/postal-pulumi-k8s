import { ComponentResource, ComponentResourceOptions, Input, output, all, interpolate } from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { Secret, Service } from "@pulumi/kubernetes/core/v1";
import { Deployment } from "@pulumi/kubernetes/apps/v1";
import { Job } from "@pulumi/kubernetes/batch/v1";
import { Ingress } from "@pulumi/kubernetes/networking/v1";

interface PostalDatabaseConfig {
    host: Input<string>;
    database: Input<string>;
    username: Input<string>;
    password: Input<string>;
}

interface PostalServiceConfig {
    image?: Input<string>;
    webReplicas?: Input<number>;
    smtpReplicas?: Input<number>;
    workerReplicas?: Input<number>;
    smtpServiceType?: Input<string>;
    smtpLoadBalancerIP?: Input<string>;
}

interface PostalIngressConfig {
    deployIngress?: Input<boolean>;
    ingressClass?: Input<string>;
}

export interface PostalArgs extends PostalDatabaseConfig, PostalServiceConfig, PostalIngressConfig {
    namespace: Input<string>;
    provider: Provider;
    domain: Input<string>;
    signingKey: Input<string>;
    railsSecretKey?: Input<string>;
}

export class Postal extends ComponentResource {
    public readonly secret: Secret;
    public readonly webDeployment: Deployment;
    public readonly webService: Service;
    public readonly smtpDeployment: Deployment;
    public readonly smtpService: Service;
    public readonly workerDeployment: Deployment;
    public readonly initJob: Job;
    public readonly ingress?: Ingress;

    constructor(name: string, args: PostalArgs, opts?: ComponentResourceOptions) {
        super("custom:postal:Postal", name, {}, opts);

        const defaultOpts = { parent: this, provider: args.provider };

        // Postal configuration secret
        this.secret = new Secret(`${name}-secret`, {
            metadata: {
                name: `${name}-config`,
                namespace: args.namespace,
                labels: {
                    app: "postal",
                    chart: "postal-1.0.0",
                    release: "postal",
                    heritage: "Pulumi"
                }
            },
            data: {
                "postal.yml": all([
                    args.password,
                    args.domain,
                    args.host,
                    args.username,
                    args.database
                ]).apply(([password, domain, host, username, database]) => {
                    const postalYmlContent = `version: 2
main_db:
  host: ${host}
  username: ${username}
  password: ${password}
  database: ${database}
message_db:
  host: ${host}
  username: ${username}
  password: ${password}
  prefix: postal
rails:
  secret_key: ${args.railsSecretKey || 'f1e4a061c0f3894a65d0335ce9d56ffa16c8b4d8dd2a101d875f703358790fc69b5a27f854dfff895b6d86cb9994ed8506e0cdec1a2cd5a1c840bf98b47431cd08de05e33a12f53219dcb795e4d72685647b40eb707555c242a1facc40b19c4cd3a35b0ca91507a672d3f7bce48a0dad81c930320001b22ba6fdc468f9a8ce08'}
postal:
  web_hostname: ${domain}
  web_protocol: https
  use_ip_pools: true
  smtp_hostname: ${domain}
  trusted_proxies:
    - 0.0.0.0/0
dns:
  mx_records:
    - "10 ${domain}"
  return_path_domain: ${domain}
  route_domain: ${domain}
  track_domain: ${domain}
  spf_include: ${domain}
web_server:
  default_bind_address: 0.0.0.0
  default_port: 5000
smtp_server:
  default_port: 25
  tls_enabled: true
`;
                    return Buffer.from(postalYmlContent).toString("base64");
                }),
                "signing.key": output(args.signingKey).apply((key: string) => Buffer.from(key).toString("base64"))
            }
        }, defaultOpts);

        // Web Deployment
        this.webDeployment = new Deployment(`${name}-web`, {
            metadata: {
                name: `${name}-web`,
                namespace: args.namespace,
                labels: {
                    app: "postal",
                    component: "web",
                    chart: "postal-1.0.0",
                    release: "postal",
                    heritage: "Pulumi"
                }
            },
            spec: {
                replicas: args.webReplicas || 1,
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
                            image: args.image || "ghcr.io/postalserver/postal:3.3.4",
                            command: ["postal", "web-server"],
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
                            }]
                        }],
                        volumes: [{
                            name: "config",
                            secret: {
                                secretName: this.secret.metadata.name
                            }
                        }]
                    }
                }
            }
        }, { ...defaultOpts, dependsOn: [this.secret] });

        // Web Service
        this.webService = new Service(`${name}-web-service`, {
            metadata: {
                name: `${name}-web`,
                namespace: args.namespace,
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
                    port: 5000,
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
        }, { ...defaultOpts, dependsOn: [this.webDeployment] });

        // SMTP Deployment
        this.smtpDeployment = new Deployment(`${name}-smtp`, {
            metadata: {
                name: `${name}-smtp`,
                namespace: args.namespace,
                labels: {
                    app: "postal",
                    component: "smtp",
                    chart: "postal-1.0.0",
                    release: "postal",
                    heritage: "Pulumi"
                }
            },
            spec: {
                replicas: args.smtpReplicas || 1,
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
                            image: args.image || "ghcr.io/postalserver/postal:3.3.4",
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
                                secretName: this.secret.metadata.name
                            }
                        }]
                    }
                }
            }
        }, { ...defaultOpts, dependsOn: [this.secret] });

        // SMTP Service
        this.smtpService = new Service(`${name}-smtp-service`, {
            metadata: {
                name: `${name}-smtp`,
                namespace: args.namespace,
                labels: {
                    app: "postal",
                    component: "smtp",
                    chart: "postal-1.0.0",
                    release: "postal",
                    heritage: "Pulumi"
                }
            },
            spec: {
                type: (args.smtpServiceType as any) || "ClusterIP",
                ...(args.smtpLoadBalancerIP && { loadBalancerIP: args.smtpLoadBalancerIP }),
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
        }, { ...defaultOpts, dependsOn: [this.smtpDeployment] });

        // Worker Deployment
        this.workerDeployment = new Deployment(`${name}-worker`, {
            metadata: {
                name: `${name}-worker`,
                namespace: args.namespace,
                labels: {
                    app: "postal",
                    component: "worker",
                    chart: "postal-1.0.0",
                    release: "postal",
                    heritage: "Pulumi"
                }
            },
            spec: {
                replicas: args.workerReplicas || 1,
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
                            image: args.image || "ghcr.io/postalserver/postal:3.3.4",
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
                                secretName: this.secret.metadata.name
                            }
                        }]
                    }
                }
            }
        }, { ...defaultOpts, dependsOn: [this.secret] });

        // Initialization Job
        this.initJob = new Job(`${name}-init`, {
            metadata: {
                name: `${name}-init`,
                namespace: args.namespace,
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
                            image: args.image || "ghcr.io/postalserver/postal:3.3.4",
                            command: ["sh", "-c", interpolate`postal initialize && printf 'admin@${args.domain}\\nPostal\\nAdmin\\nPostalAdmin123!' | postal make-user`],
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
                                secretName: this.secret.metadata.name
                            }
                        }]
                    }
                }
            }
        }, { ...defaultOpts, dependsOn: [this.secret] });

        // Optional Ingress
        if (args.deployIngress) {
            this.ingress = new Ingress(`${name}-web-ingress`, {
                metadata: {
                    name: `${name}-web`,
                    namespace: args.namespace,
                    labels: {
                        app: "postal",
                        component: "web",
                        chart: "postal-1.0.0",
                        release: "postal",
                        heritage: "Pulumi"
                    },
                    annotations: {
                        "kubernetes.io/tls-acme": "true",
                        "kubernetes.io/ingress.class": args.ingressClass || "nginx"
                    }
                },
                spec: {
                    ingressClassName: args.ingressClass || "nginx",
                    tls: [{
                        secretName: `${name}-web-tls`,
                        hosts: [args.domain]
                    }],
                    rules: [{
                        host: args.domain,
                        http: {
                            paths: [{
                                path: "/",
                                pathType: "ImplementationSpecific",
                                backend: {
                                    service: {
                                        name: this.webService.metadata.name,
                                        port: {
                                            number: 5000
                                        }
                                    }
                                }
                            }]
                        }
                    }]
                }
            }, { ...defaultOpts, dependsOn: [this.webService] });
        }

        this.registerOutputs({
            secret: this.secret,
            webDeployment: this.webDeployment,
            webService: this.webService,
            smtpDeployment: this.smtpDeployment,
            smtpService: this.smtpService,
            workerDeployment: this.workerDeployment,
            initJob: this.initJob,
            ingress: this.ingress,
        });
    }
} 