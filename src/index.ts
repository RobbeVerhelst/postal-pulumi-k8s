import * as pulumi from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { Namespace } from "@pulumi/kubernetes/core/v1";
import { MariaDB } from "./mariadb";
import { Postal } from "./postal";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface DatabaseConfig {
    host: string;
    database: string;
    username: string;
    storageSize: string;
    storageClass: string;
}

interface ServiceConfig {
    image: string;
    webReplicas: number;
    smtpReplicas: number;
    workerReplicas: number;
    smtpServiceType: string;
    smtpLoadBalancerIP: string;
}

interface IngressConfig {
    ingressClass: string;
    deployIngress: boolean;
}

// Get stack name and configuration
const config = new pulumi.Config();
const postalConfig = new pulumi.Config("postal");

// Required configuration
const kubeconfig = config.require("kubeconfig");
const postalDomain = postalConfig.require("domain");
const mariadbPassword = postalConfig.requireSecret("mariadb-password");
const signingKey = postalConfig.requireSecret("signing-key");
const mariadbRootPassword = postalConfig.requireSecret("mariadb-root-password");

// Optional configuration
const railsSecretKey = postalConfig.getSecret("rails-secret-key");

// Database configuration with defaults
const dbConfig: DatabaseConfig = {
    host: postalConfig.get("mariadb-host") || "postal-mariadb-service",
    database: postalConfig.get("mariadb-database") || "postal",
    username: postalConfig.get("mariadb-username") || "postal",
    storageSize: postalConfig.get("mariadb-storage-size") || "8Gi",
    storageClass: postalConfig.get("mariadb-storage-class") || "",
};

// Service configuration with defaults
const serviceConfig: ServiceConfig = {
    image: postalConfig.get("image") || "ghcr.io/postalserver/postal:3.3.4",
    webReplicas: parseInt(postalConfig.get("web-replicas") || "1"),
    smtpReplicas: parseInt(postalConfig.get("smtp-replicas") || "1"),
    workerReplicas: parseInt(postalConfig.get("worker-replicas") || "1"),
    smtpServiceType: postalConfig.get("smtp-service-type") || "ClusterIP",
    smtpLoadBalancerIP: postalConfig.get("smtp-loadbalancer-ip") || "",
};

// Ingress configuration with defaults
const ingressConfig: IngressConfig = {
    ingressClass: postalConfig.get("ingress-class") || "nginx",
    deployIngress: postalConfig.getBoolean("deploy-ingress") ?? false,
};

// MariaDB deployment configuration
const deployMariadb = postalConfig.getBoolean("deploy-mariadb") ?? true;

// ============================================================================
// INFRASTRUCTURE
// ============================================================================

// Kubernetes provider
const k8sProvider = new Provider("k8s-provider", {
    kubeconfig: kubeconfig,
});

// Namespace
const postalNamespace = new Namespace("postal-ns", {
    metadata: { name: "postal" },
}, { provider: k8sProvider });

// ============================================================================
// MARIADB
// ============================================================================

let mariadb: MariaDB | undefined;

if (deployMariadb) {
    mariadb = new MariaDB("postal-mariadb", {
        namespace: postalNamespace.metadata.name,
        provider: k8sProvider,
        rootPassword: mariadbRootPassword,
        database: dbConfig.database,
        username: dbConfig.username,
        password: mariadbPassword,
        storageSize: dbConfig.storageSize,
        ...(dbConfig.storageClass && { storageClass: dbConfig.storageClass }),
    }, { dependsOn: [postalNamespace] });
}

// ============================================================================
// POSTAL
// ============================================================================

const postal = new Postal("postal", {
    namespace: postalNamespace.metadata.name,
    provider: k8sProvider,
    domain: postalDomain,
    host: dbConfig.host,
    database: dbConfig.database,
    username: dbConfig.username,
    password: mariadbPassword,
    signingKey: signingKey,
    ...(railsSecretKey && { railsSecretKey: railsSecretKey }),
    image: serviceConfig.image,
    webReplicas: serviceConfig.webReplicas,
    smtpReplicas: serviceConfig.smtpReplicas,
    workerReplicas: serviceConfig.workerReplicas,
    smtpServiceType: serviceConfig.smtpServiceType,
    smtpLoadBalancerIP: serviceConfig.smtpLoadBalancerIP,
    deployIngress: ingressConfig.deployIngress,
    ingressClass: ingressConfig.ingressClass,
}, { dependsOn: mariadb ? [postalNamespace, mariadb] : [postalNamespace] });

// ============================================================================
// EXPORTS
// ============================================================================

export const namespaceName = postalNamespace.metadata.name;
export const webUrl = `https://${postalDomain}`;
export const smtpServiceName = postal.smtpService.metadata.name;
export const smtpServiceType = postal.smtpService.spec.type;
export const mariadbServiceName = mariadb ? mariadb.service.metadata.name : "external-mariadb";
export const mariadbEndpoint = mariadb ? mariadb.service.metadata.name.apply(name => `${name}.postal.svc.cluster.local:3306`) : `${dbConfig.host}:3306`;