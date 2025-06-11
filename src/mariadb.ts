import { ComponentResource, ComponentResourceOptions, Input, output, all } from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { Secret, PersistentVolumeClaim, Service, ConfigMap } from "@pulumi/kubernetes/core/v1";
import { Deployment } from "@pulumi/kubernetes/apps/v1";

interface MariaDBResources {
    requests?: {
        cpu?: Input<string>;
        memory?: Input<string>;
    };
    limits?: {
        cpu?: Input<string>;
        memory?: Input<string>;
    };
}

export interface MariaDBArgs {
    namespace: Input<string>;
    provider: Provider;
    rootPassword: Input<string>;
    database: Input<string>;
    username: Input<string>;
    password: Input<string>;
    storageSize?: Input<string>;
    storageClass?: Input<string>;
    image?: Input<string>;
    port?: Input<number>;
    resources?: MariaDBResources;
}

export class MariaDB extends ComponentResource {
    public readonly service: Service;
    public readonly deployment: Deployment;
    public readonly pvc: PersistentVolumeClaim;
    public readonly secret: Secret;
    public readonly configMap: ConfigMap;

    constructor(name: string, args: MariaDBArgs, opts?: ComponentResourceOptions) {
        super("custom:mariadb:MariaDB", name, {}, opts);

        const defaultOpts = { parent: this, provider: args.provider };

        // MariaDB secret
        this.secret = new Secret(`${name}-secret`, {
            metadata: {
                name: `${name}-secret`,
                namespace: args.namespace,
            },
            data: {
                "mariadb-root-password": output(args.rootPassword).apply(p => Buffer.from(p).toString("base64")),
                "mariadb-password": output(args.password).apply(p => Buffer.from(p).toString("base64")),
            },
        }, defaultOpts);

        // ConfigMap for initialization script
        this.configMap = new ConfigMap(`${name}-init`, {
            metadata: {
                name: `${name}-init`,
                namespace: args.namespace,
            },
            data: {
                "init-postal.sql": all([args.username]).apply(([username]) => `
-- Grant permissions for Postal mail server databases
GRANT ALL PRIVILEGES ON \`postal-%\`.* TO '${username}'@'%';
FLUSH PRIVILEGES;
`)
            },
        }, defaultOpts);

        // PersistentVolumeClaim
        this.pvc = new PersistentVolumeClaim(`${name}-pvc`, {
            metadata: {
                name: `${name}-pvc`,
                namespace: args.namespace,
            },
            spec: {
                accessModes: ["ReadWriteOnce"],
                resources: {
                    requests: {
                        storage: args.storageSize || "8Gi",
                    },
                },
                ...(args.storageClass && { storageClassName: args.storageClass }),
            },
        }, defaultOpts);

        // MariaDB Deployment
        this.deployment = new Deployment(`${name}-deployment`, {
            metadata: {
                name: `${name}-deployment`,
                namespace: args.namespace,
                labels: {
                    app: name,
                    component: "mariadb",
                },
            },
            spec: {
                replicas: 1,
                selector: {
                    matchLabels: {
                        app: name,
                        component: "mariadb",
                    },
                },
                template: {
                    metadata: {
                        labels: {
                            app: name,
                            component: "mariadb",
                        },
                    },
                    spec: {
                        containers: [{
                            name: "mariadb",
                            image: args.image || "mariadb:10.11",
                            ports: [{
                                containerPort: args.port || 3306,
                                name: "mariadb",
                            }],
                            env: [
                                {
                                    name: "MARIADB_ROOT_PASSWORD",
                                    valueFrom: {
                                        secretKeyRef: {
                                            name: this.secret.metadata.name,
                                            key: "mariadb-root-password",
                                        },
                                    },
                                },
                                {
                                    name: "MARIADB_DATABASE",
                                    value: args.database,
                                },
                                {
                                    name: "MARIADB_USER",
                                    value: args.username,
                                },
                                {
                                    name: "MARIADB_PASSWORD",
                                    valueFrom: {
                                        secretKeyRef: {
                                            name: this.secret.metadata.name,
                                            key: "mariadb-password",
                                        },
                                    },
                                },
                            ],
                            volumeMounts: [
                                {
                                    name: "mariadb-data",
                                    mountPath: "/var/lib/mysql",
                                },
                                {
                                    name: "init-scripts",
                                    mountPath: "/docker-entrypoint-initdb.d",
                                    readOnly: true,
                                }
                            ],
                            livenessProbe: {
                                exec: {
                                    command: ["mysqladmin", "ping", "-h", "localhost"],
                                },
                                initialDelaySeconds: 30,
                                periodSeconds: 10,
                                timeoutSeconds: 5,
                            },
                            readinessProbe: {
                                exec: {
                                    command: ["mysqladmin", "ping", "-h", "localhost"],
                                },
                                initialDelaySeconds: 5,
                                periodSeconds: 5,
                                timeoutSeconds: 1,
                            },
                            resources: args.resources || {
                                requests: {
                                    cpu: "250m",
                                    memory: "512Mi",
                                },
                                limits: {
                                    cpu: "1000m",
                                    memory: "1Gi",
                                },
                            },
                        }],
                        volumes: [
                            {
                                name: "mariadb-data",
                                persistentVolumeClaim: {
                                    claimName: this.pvc.metadata.name,
                                },
                            },
                            {
                                name: "init-scripts",
                                configMap: {
                                    name: this.configMap.metadata.name,
                                },
                            }
                        ],
                        securityContext: {
                            runAsUser: 999,
                            runAsGroup: 999,
                            fsGroup: 999,
                        },
                    },
                },
            },
        }, { ...defaultOpts, dependsOn: [this.secret, this.pvc, this.configMap] });

        // MariaDB Service
        this.service = new Service(`${name}-service`, {
            metadata: {
                name: `${name}-service`,
                namespace: args.namespace,
                labels: {
                    app: name,
                    component: "mariadb",
                },
            },
            spec: {
                type: "ClusterIP",
                ports: [{
                    port: args.port || 3306,
                    targetPort: "mariadb",
                    protocol: "TCP",
                    name: "mariadb",
                }],
                selector: {
                    app: name,
                    component: "mariadb",
                },
            },
        }, { ...defaultOpts, dependsOn: [this.deployment] });

        this.registerOutputs({
            service: this.service,
            deployment: this.deployment,
            pvc: this.pvc,
            secret: this.secret,
            configMap: this.configMap,
        });
    }
} 