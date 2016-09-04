## [**7. Security**](http://kafka.apache.org/documentation.html#security)

### [**7.1 Security Overview**](http://kafka.apache.org/documentation.html#security_overview)

In release 0.9.0.0, the Kafka community added a number of features that, used either separately or together, increases security in a Kafka cluster. These features are considered to be of beta quality. The following security measures are currently supported:

1. Authentication of connections to brokers from clients \(producers and consumers\), other brokers and tools, using either SSL or SASL \(Kerberos\). SASL\/PLAIN can also be used from release 0.10.0.0 onwards.
2. Authentication of connections from brokers to ZooKeeper
3. Encryption of data transferred between brokers and clients, between brokers, or between brokers and tools using SSL \(Note that there is a performance degradation when SSL is enabled, the magnitude of which depends on the CPU type and the JVM implementation.\)
4. Authorization of read \/ write operations by clients
5. Authorization is pluggable and integration with external authorization services is supported

It's worth noting that security is optional - non-secured clusters are supported, as well as a mix of authenticated, unauthenticated, encrypted and non-encrypted clients. The guides below explain how to configure and use the security features in both clients and brokers.

### [**7.2 Encryption and Authentication using SSL**](http://kafka.apache.org/documentation.html#security_ssl)

Apache Kafka allows clients to connect over SSL. By default SSL is disabled but can be turned on as needed.

1. #### [**Generate SSL key and certificate for each Kafka broker**](http://kafka.apache.org/documentation.html#security_ssl_key)

  The first step of deploying HTTPS is to generate the key and the certificate for each machine in the cluster. You can use Java's keytool utility to accomplish this task. We will generate the key into a temporary keystore initially so that we can export and sign it later with CA.
  ```
          keytool -keystore server.keystore.jks -alias localhost -validity {validity} -genkey
  ```

  You need to specify two parameters in the above command:
  1. keystore: the keystore file that stores the certificate. The keystore file contains the private key of the certificate; therefore, it needs to be kept safely.
  2. validity: the valid time of the certificate in days.



  Note: By default the property `ssl.endpoint.identification.algorithm` is not defined, so hostname verification is not performed. In order to enable hostname verification, set the following property:
  ```
  	ssl.endpoint.identification.algorithm=HTTPS 
  ```

  Once enabled, clients will verify the server's fully qualified domain name \(FQDN\) against one of the following two fields:
  1. Common Name \(CN\)
  2. Subject Alternative Name \(SAN\)



  Both fields are valid, RFC-2818 recommends the use of SAN however. SAN is also more flexible, allowing for multiple DNS entries to be declared. Another advantage is that the CN can be set to a more meaningful value for authorization purposes. To add a SAN field append the following argument `-ext SAN=DNS:{FQDN} `to the keytool command:
  ```
  	keytool -keystore server.keystore.jks -alias localhost -validity {validity} -genkey -ext SAN=DNS:{FQDN}
  	
  ```

  The following command can be run afterwards to verify the contents of the generated certificate:
  ```
  	keytool -list -v -keystore server.keystore.jks
  	
  ```

2. #### [**Creating your own CA**](http://kafka.apache.org/documentation.html#security_ssl_ca)

  After the first step, each machine in the cluster has a public-private key pair, and a certificate to identify the machine. The certificate, however, is unsigned, which means that an attacker can create such a certificate to pretend to be any machine.
  Therefore, it is important to prevent forged certificates by signing them for each machine in the cluster. A certificate authority \(CA\) is responsible for signing certificates. CA works likes a government that issues passports—the government stamps \(signs\) each passport so that the passport becomes difficult to forge. Other governments verify the stamps to ensure the passport is authentic. Similarly, the CA signs the certificates, and the cryptography guarantees that a signed certificate is computationally difficult to forge. Thus, as long as the CA is a genuine and trusted authority, the clients have high assurance that they are connecting to the authentic machines.

  ```
          openssl req -new -x509 -keyout ca-key -out ca-cert -days 365
  ```

  The generated CA is simply a public-private key pair and certificate, and it is intended to sign other certificates.

  The next step is to add the generated CA to the \*\*clients' truststore\*\* so that the clients can trust this CA:
  ```
          keytool -keystore server.truststore.jks -alias CARoot -import -file ca-cert
  ```

  **Note:** If you configure the Kafka brokers to require client authentication by setting ssl.client.auth to be "requested" or "required" on the [**Kafka brokers config**](http://kafka.apache.org/documentation.html#config_broker) then you must provide a truststore for the Kafka brokers as well and it should have all the CA certificates that clients keys were signed by.
  ```
          keytool -keystore client.truststore.jks -alias CARoot -import -file ca-cert
  ```

  In contrast to the keystore in step 1 that stores each machine's own identity, the truststore of a client stores all the certificates that the client should trust. Importing a certificate into one's truststore also means trusting all certificates that are signed by that certificate. As the analogy above, trusting the government \(CA\) also means trusting all passports \(certificates\) that it has issued. This attribute is called the chain of trust, and it is particularly useful when deploying SSL on a large Kafka cluster. You can sign all certificates in the cluster with a single CA, and have all machines share the same truststore that trusts the CA. That way all machines can authenticate all other machines.
3. #### [**Signing the certificate**](http://kafka.apache.org/documentation.html#security_ssl_signing)

  The next step is to sign all certificates generated by step 1 with the CA generated in step 2. First, you need to export the certificate from the keystore:
  ```
          keytool -keystore server.keystore.jks -alias localhost -certreq -file cert-file
  ```

  Then sign it with the CA:
  ```
          openssl x509 -req -CA ca-cert -CAkey ca-key -in cert-file -out cert-signed -days {validity} -CAcreateserial -passin pass:{ca-password}
  ```

  Finally, you need to import both the certificate of the CA and the signed certificate into the keystore:
  ```
          keytool -keystore server.keystore.jks -alias CARoot -import -file ca-cert
          keytool -keystore server.keystore.jks -alias localhost -import -file cert-signed
  ```

  The definitions of the parameters are the following:
  1. keystore: the location of the keystore
  2. ca-cert: the certificate of the CA
  3. ca-key: the private key of the CA
  4. ca-password: the passphrase of the CA
  5. cert-file: the exported, unsigned certificate of the server
  6. cert-signed: the signed certificate of the server

  Here is an example of a bash script with all above steps. Note that one of the commands assumes a password of \`test1234\`, so either use that password or edit the command before running it.
  ```
          #!/bin/bash
          #Step 1
          keytool -keystore server.keystore.jks -alias localhost -validity 365 -keyalg RSA -genkey
          #Step 2
          openssl req -new -x509 -keyout ca-key -out ca-cert -days 365
          keytool -keystore server.truststore.jks -alias CARoot -import -file ca-cert
          keytool -keystore client.truststore.jks -alias CARoot -import -file ca-cert
          #Step 3
          keytool -keystore server.keystore.jks -alias localhost -certreq -file cert-file
          openssl x509 -req -CA ca-cert -CAkey ca-key -in cert-file -out cert-signed -days 365 -CAcreateserial -passin pass:test1234
          keytool -keystore server.keystore.jks -alias CARoot -import -file ca-cert
          keytool -keystore server.keystore.jks -alias localhost -import -file cert-signed
  ```

4. #### [**Configuring Kafka Brokers**](http://kafka.apache.org/documentation.html#security_configbroker)

  Kafka Brokers support listening for connections on multiple ports. We need to configure the following property in server.properties, which must have one or more comma-separated values:
  ```
  listeners
  ```

  If SSL is not enabled for inter-broker communication \(see below for how to enable it\), both PLAINTEXT and SSL ports will be necessary.
  ```
          listeners=PLAINTEXT://host.name:port,SSL://host.name:port
  ```

  Following SSL configs are needed on the broker side
  ```
          ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
          ssl.keystore.password=test1234
          ssl.key.password=test1234
          ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
          ssl.truststore.password=test1234
  ```

  Optional settings that are worth considering:
  1. ssl.client.auth=none \("required" =&gt; client authentication is required, "requested" =&gt; client authentication is requested and client without certs can still connect. The usage of "requested" is discouraged as it provides a false sense of security and misconfigured clients will still connect successfully.\)
  2. ssl.cipher.suites \(Optional\). A cipher suite is a named combination of authentication, encryption, MAC and key exchange algorithm used to negotiate the security settings for a network connection using TLS or SSL network protocol. \(Default is an empty list\)
  3. ssl.enabled.protocols=TLSv1.2,TLSv1.1,TLSv1 \(list out the SSL protocols that you are going to accept from clients. Do note that SSL is deprecated in favor of TLS and using SSL in production is not recommended\)
  4. ssl.keystore.type=JKS
  5. ssl.truststore.type=JKS

  If you want to enable SSL for inter-broker communication, add the following to the broker properties file \(it defaults to PLAINTEXT\)
  ```
          security.inter.broker.protocol=SSL
  ```

  Due to import regulations in some countries, the Oracle implementation limits the strength of cryptographic algorithms available by default. If stronger algorithms are needed \(for example, AES with 256-bit keys\), the [**JCE Unlimited Strength Jurisdiction Policy Files**](http://www.oracle.com/technetwork/java/javase/downloads/index.html) must be obtained and installed in the JDK\/JRE. See the [**JCA Providers Documentation**](https://docs.oracle.com/javase/8/docs/technotes/guides/security/SunProviders.html) for more information.

  Once you start the broker you should be able to see in the server.log
  ```
          with addresses: PLAINTEXT -> EndPoint(192.168.64.1,9092,PLAINTEXT),SSL -> EndPoint(192.168.64.1,9093,SSL)
  ```

  To check quickly if the server keystore and truststore are setup properly you can run the following command
  ```
  openssl s_client -debug -connect localhost:9093 -tls1
  ```

  \(Note: TLSv1 should be listed under ssl.enabled.protocols\)

  In the output of this command you should see server's certificate:
  ```
          -----BEGIN CERTIFICATE-----
          {variable sized random bytes}
          -----END CERTIFICATE-----
          subject=/C=US/ST=CA/L=Santa Clara/O=org/OU=org/CN=Sriharsha Chintalapani
          issuer=/C=US/ST=CA/L=Santa Clara/O=org/OU=org/CN=kafka/emailAddress=test@test.com
  ```

  If the certificate does not show up or if there are any other error messages then your keystore is not setup properly.
5. #### [**Configuring Kafka Clients**](http://kafka.apache.org/documentation.html#security_configclients)

  SSL is supported only for the new Kafka Producer and Consumer, the older API is not supported. The configs for SSL will be the same for both producer and consumer.

  If client authentication is not required in the broker, then the following is a minimal configuration example:
  ```
          security.protocol=SSL
          ssl.truststore.location=/var/private/ssl/kafka.client.truststore.jks
          ssl.truststore.password=test1234
  ```

  If client authentication is required, then a keystore must be created like in step 1 and the following must also be configured:
  ```
          ssl.keystore.location=/var/private/ssl/kafka.client.keystore.jks
          ssl.keystore.password=test1234
          ssl.key.password=test1234
  ```

  Other configuration settings that may also be needed depending on our requirements and the broker configuration:
  1. ssl.provider \(Optional\). The name of the security provider used for SSL connections. Default value is the default security provider of the JVM.
  2. ssl.cipher.suites \(Optional\). A cipher suite is a named combination of authentication, encryption, MAC and key exchange algorithm used to negotiate the security settings for a network connection using TLS or SSL network protocol.
  3. ssl.enabled.protocols=TLSv1.2,TLSv1.1,TLSv1. It should list at least one of the protocols configured on the broker side
  4. ssl.truststore.type=JKS
  5. ssl.keystore.type=JKS



  Examples using console-producer and console-consumer:
  ```
          kafka-console-producer.sh --broker-list localhost:9093 --topic test --producer.config client-ssl.properties
          kafka-console-consumer.sh --bootstrap-server localhost:9093 --topic test --new-consumer --consumer.config client-ssl.properties
  ```


### [**7.3 Authentication using SASL**](http://kafka.apache.org/documentation.html#security_sasl)

1. #### [**SASL configuration for Kafka brokers**](http://kafka.apache.org/documentation.html#security_sasl_brokerconfig)

  1. Select one or more supported mechanisms to enable in the broker. GSSAPI and PLAIN are the mechanisms currently supported in Kafka.
  2. Add a JAAS config file for the selected mechanisms as described in the examples for setting up[**GSSAPI \(Kerberos\)**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_brokerconfig) or [**PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain_brokerconfig).
  3. Pass the JAAS config file location as JVM parameter to each Kafka broker. For example:
    ```
        -Djava.security.auth.login.config=/etc/kafka/kafka_server_jaas.conf
    ```

  4. Configure a SASL port in server.properties, by adding at least one of SASL\_PLAINTEXT or SASL\_SSL to the _listeners_ parameter, which contains one or more comma-separated values:
    ```
        listeners=SASL_PLAINTEXT://host.name:port
    ```

    If SASL\_SSL is used, then [**SSL must also be configured**](http://kafka.apache.org/documentation.html#security_ssl). If you are only configuring a SASL port \(or if you want the Kafka brokers to authenticate each other using SASL\) then make sure you set the same SASL protocol for inter-broker communication:
    ```
        security.inter.broker.protocol=SASL_PLAINTEXT (or SASL_SSL)
    ```

  5. Enable one or more SASL mechanisms in server.properties:
    ```
        sasl.enabled.mechanisms=GSSAPI (,PLAIN)
    ```

  6. Configure the SASL mechanism for inter-broker communication in server.properties if using SASL for inter-broker communication:
    ```
        sasl.mechanism.inter.broker.protocol=GSSAPI (or PLAIN)
    ```

  7. Follow the steps in [**GSSAPI \(Kerberos\)**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_brokerconfig) or [**PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain_brokerconfig) to configure SASL for the enabled mechanisms. To enable multiple mechanisms in the broker, follow the steps [**here**](http://kafka.apache.org/documentation.html#security_sasl_multimechanism).
  8. [**Important notes:**](http://kafka.apache.org/documentation.html#security_sasl_brokernotes)
    1. KafkaServer is the section name in the JAAS file used by each KafkaServer\/Broker. This section provides SASL configuration options for the broker including any SASL client connections made by the broker for inter-broker communication.
    2. Client section is used to authenticate a SASL connection with zookeeper. It also allows the brokers to set SASL ACL on zookeeper nodes which locks these nodes down so that only the brokers can modify it. It is necessary to have the same principal name across all brokers. If you want to use a section name other than Client, set the system propertyzookeeper.sasl.client to the appropriate name \(_e.g._, -Dzookeeper.sasl.client=ZkClient\).
    3. ZooKeeper uses "zookeeper" as the service name by default. If you want to change this, set the system property zookeeper.sasl.client.username to the appropriate name \(_e.g._, -Dzookeeper.sasl.client.username=zk\).


2. #### [**SASL configuration for Kafka clients**](http://kafka.apache.org/documentation.html#security_sasl_clientconfig)

  SASL authentication is only supported for the new Java Kafka producer and consumer, the older API is not supported. To configure SASL authentication on the clients:
  1. Select a SASL mechanism for authentication.
  2. Add a JAAS config file for the selected mechanism as described in the examples for setting up[**GSSAPI \(Kerberos\)**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_clientconfig) or [**PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain_clientconfig). KafkaClient is the section name in the JAAS file used by Kafka clients.
  3. Pass the JAAS config file location as JVM parameter to each client JVM. For example:
    ```
        -Djava.security.auth.login.config=/etc/kafka/kafka_client_jaas.conf
    ```

  4. Configure the following properties in producer.properties or consumer.properties:
    ```
        security.protocol=SASL_PLAINTEXT (or SASL_SSL)
        sasl.mechanism=GSSAPI (or PLAIN)
    ```

  5. Follow the steps in [**GSSAPI \(Kerberos\)**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_clientconfig) or [**PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain_clientconfig) to configure SASL for the selected mechanism.

3. #### [**Authentication using SASL\/Kerberos**](http://kafka.apache.org/documentation.html#security_sasl_kerberos)

  1. ##### [**Prerequisites**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_prereq)

    1. **Kerberos**

      If your organization is already using a Kerberos server \(for example, by using Active Directory\), there is no need to install a new server just for Kafka. Otherwise you will need to install one, your Linux vendor likely has packages for Kerberos and a short guide on how to install and configure it \([**Ubuntu**](https://help.ubuntu.com/community/Kerberos), [**Redhat**](https://access.redhat.com/documentation/en-US/Red_Hat_Enterprise_Linux/6/html/Managing_Smart_Cards/installing-kerberos.html)\). Note that if you are using Oracle Java, you will need to download JCE policy files for your Java version and copy them to $JAVA\_HOME\/jre\/lib\/security.
    2. **Create Kerberos Principals**

      If you are using the organization's Kerberos or Active Directory server, ask your Kerberos administrator for a principal for each Kafka broker in your cluster and for every operating system user that will access Kafka with Kerberos authentication \(via clients and tools\).

      If you have installed your own Kerberos, you will need to create these principals yourself using the following commands:
      ```
          sudo /usr/sbin/kadmin.local -q 'addprinc -randkey kafka/{hostname}@{REALM}'
          sudo /usr/sbin/kadmin.local -q "ktadd -k /etc/security/keytabs/{keytabname}.keytab kafka/{hostname}@{REALM}"
      ```

    3. **Make sure all hosts can be reachable using hostnames** - it is a Kerberos requirement that all your hosts can be resolved with their FQDNs.

  2. ##### [**Configuring Kafka Brokers**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_brokerconfig)

    1. Add a suitably modified JAAS file similar to the one below to each Kafka broker's config directory, let's call it kafka\_server\_jaas.conf for this example \(note that each broker should have its own keytab\):
      ```
          KafkaServer {
              com.sun.security.auth.module.Krb5LoginModule required
              useKeyTab=true
              storeKey=true
              keyTab="/etc/security/keytabs/kafka_server.keytab"
              principal="kafka/kafka1.hostname.com@EXAMPLE.COM";
          };

          // Zookeeper client authentication
          Client {
             com.sun.security.auth.module.Krb5LoginModule required
             useKeyTab=true
             storeKey=true
             keyTab="/etc/security/keytabs/kafka_server.keytab"
             principal="kafka/kafka1.hostname.com@EXAMPLE.COM";
          };
      ```

    2. KafkaServer section in the JAAS file tells the broker which principal to use and the location of the keytab where this principal is stored. It allows the broker to login using the keytab specified in this section. See [**notes**](http://kafka.apache.org/documentation.html#security_sasl_brokernotes) for more details on Zookeeper SASL configuration.
    3. Pass the JAAS and optionally the krb5 file locations as JVM parameters to each Kafka broker \(see [**here**](https://docs.oracle.com/javase/8/docs/technotes/guides/security/jgss/tutorials/KerberosReq.html) for more details\):
      ```
          -Djava.security.krb5.conf=/etc/kafka/krb5.conf
          -Djava.security.auth.login.config=/etc/kafka/kafka_server_jaas.conf
      ```

    4. Make sure the keytabs configured in the JAAS file are readable by the operating system user who is starting kafka broker.
    5. Configure SASL port and SASL mechanisms in server.properties as described [**here**](http://kafka.apache.org/documentation.html#security_sasl_brokerconfig). For example:
      ```
          listeners=SASL_PLAINTEXT://host.name:port
          security.inter.broker.protocol=SASL_PLAINTEXT
          sasl.mechanism.inter.broker.protocol=GSSAPI
          sasl.enabled.mechanisms=GSSAPI
                
      ```

    6. We must also configure the service name in server.properties, which should match the principal name of the kafka brokers. In the above example, principal is "kafka\/kafka1.hostname.com@EXAMPLE.com", so:
      ```
          sasl.kerberos.service.name=kafka
      ```


  3. ##### [**Configuring Kafka Clients**](http://kafka.apache.org/documentation.html#security_kerberos_sasl_clientconfig)

    To configure SASL authentication on the clients:
    1. Clients \(producers, consumers, connect workers, etc\) will authenticate to the cluster with their own principal \(usually with the same name as the user running the client\), so obtain or create these principals as needed. Then create a JAAS file for each principal. The KafkaClient section describes how the clients like producer and consumer can connect to the Kafka Broker. The following is an example configuration for a client using a keytab \(recommended for long-running processes\):
      ```
          KafkaClient {
              com.sun.security.auth.module.Krb5LoginModule required
              useKeyTab=true
              storeKey=true
              keyTab="/etc/security/keytabs/kafka_client.keytab"
              principal="kafka-client-1@EXAMPLE.COM";
          };
      ```

      For command-line utilities like kafka-console-consumer or kafka-console-producer, kinit can be used along with "useTicketCache=true" as in:
      ```
          KafkaClient {
              com.sun.security.auth.module.Krb5LoginModule required
              useTicketCache=true;
          };
      ```

    2. Pass the JAAS and optionally krb5 file locations as JVM parameters to each client JVM \(see[**here**](https://docs.oracle.com/javase/8/docs/technotes/guides/security/jgss/tutorials/KerberosReq.html) for more details\):
      ```
          -Djava.security.krb5.conf=/etc/kafka/krb5.conf
          -Djava.security.auth.login.config=/etc/kafka/kafka_client_jaas.conf
      ```

    3. Make sure the keytabs configured in the kafka\_client\_jaas.conf are readable by the operating system user who is starting kafka client.
    4. Configure the following properties in producer.properties or consumer.properties:
      ```
          security.protocol=SASL_PLAINTEXT (or SASL_SSL)
          sasl.mechanism=GSSAPI
          sasl.kerberos.service.name=kafka
      ```



4. #### [**Authentication using SASL\/PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain)

  SASL\/PLAIN is a simple username\/password authentication mechanism that is typically used with TLS for encryption to implement secure authentication. Kafka supports a default implementation for SASL\/PLAIN which can be extended for production use as described [**here**](http://kafka.apache.org/documentation.html#security_sasl_plain_production).

  The username is used as the authenticated `Principal` for configuration of ACLs etc.
  1. ##### [**Configuring Kafka Brokers**](http://kafka.apache.org/documentation.html#security_sasl_plain_brokerconfig)

    1. Add a suitably modified JAAS file similar to the one below to each Kafka broker's config directory, let's call it kafka\_server\_jaas.conf for this example:
      ```
          KafkaServer {
              org.apache.kafka.common.security.plain.PlainLoginModule required
              username="admin"
              password="admin-secret"
              user_admin="admin-secret"
              user_alice="alice-secret";
          };
      ```

      This configuration defines two users \(_admin_ and _alice_\). The properties username andpassword in the KafkaServer section are used by the broker to initiate connections to other brokers. In this example, _admin_ is the user for inter-broker communication. The set of properties user\__userName_ defines the passwords for all users that connect to the broker and the broker validates all client connections including those from other brokers using these properties.
    2. Pass the JAAS config file location as JVM parameter to each Kafka broker:
      ```
          -Djava.security.auth.login.config=/etc/kafka/kafka_server_jaas.conf
      ```

    3. Configure SASL port and SASL mechanisms in server.properties as described [**here**](http://kafka.apache.org/documentation.html#security_sasl_brokerconfig). For example:
      ```
          listeners=SASL_SSL://host.name:port
          security.inter.broker.protocol=SASL_SSL
          sasl.mechanism.inter.broker.protocol=PLAIN
          sasl.enabled.mechanisms=PLAIN
      ```


  2. ##### [**Configuring Kafka Clients**](http://kafka.apache.org/documentation.html#security_sasl_plain_clientconfig)

    To configure SASL authentication on the clients:
    1. The KafkaClient section describes how the clients like producer and consumer can connect to the Kafka Broker. The following is an example configuration for a client for the PLAIN mechanism:
      ```
          KafkaClient {
              org.apache.kafka.common.security.plain.PlainLoginModule required
              username="alice"
              password="alice-secret";
          };
      ```

      The properties username and password in the KafkaClient section are used by clients to configure the user for client connections. In this example, clients connect to the broker as user _alice_.
    2. Pass the JAAS config file location as JVM parameter to each client JVM:
      ```
          -Djava.security.auth.login.config=/etc/kafka/kafka_client_jaas.conf
      ```

    3. Configure the following properties in producer.properties or consumer.properties:
      ```
          security.protocol=SASL_SSL
          sasl.mechanism=PLAIN
      ```


  3. ##### [**Use of SASL\/PLAIN in production**](http://kafka.apache.org/documentation.html#security_sasl_plain_production)

    * SASL\/PLAIN should be used only with SSL as transport layer to ensure that clear passwords are not transmitted on the wire without encryption.
    * The default implementation of SASL\/PLAIN in Kafka specifies usernames and passwords in the JAAS configuration file as shown [**here**](http://kafka.apache.org/documentation.html#security_sasl_plain_brokerconfig). To avoid storing passwords on disk, you can plugin your own implementation of `javax.security.auth.spi.LoginModule` that provides usernames and passwords from an external source. The login module implementation should provide username as the public credential and password as the private credential of the`Subject`. The default implementation`org.apache.kafka.common.security.plain.PlainLoginModule` can be used as an example.
    * In production systems, external authentication servers may implement password authentication. Kafka brokers can be integrated with these servers by adding your own implementation of `javax.security.sasl.SaslServer`. The default implementation included in Kafka in the package `org.apache.kafka.common.security.plain` can be used as an example to get started.
      * New providers must be installed and registered in the JVM. Providers can be installed by adding provider classes to the normal CLASSPATH or bundled as a jar file and added to_JAVA\_HOME_\/lib\/ext.
      * Providers can be registered statically by adding a provider to the security properties file_JAVA\_HOME_\/lib\/security\/java.security.
        ```
            security.provider.n=providerClassName
        ```

        where _providerClassName_ is the fully qualified name of the new provider and _n_ is the preference order with lower numbers indicating higher preference.
      * Alternatively, you can register providers dynamically at runtime by invoking`Security.addProvider` at the beginning of the client application or in a static initializer in the login module. For example:
        ```
            Security.addProvider(new PlainSaslServerProvider());
        ```

      * For more details, see [**JCA Reference**](http://docs.oracle.com/javase/8/docs/technotes/guides/security/crypto/CryptoSpec.html).



5. #### [**Enabling multiple SASL mechanisms in a broker**](http://kafka.apache.org/documentation.html#security_sasl_multimechanism)

  1. Specify configuration for the login modules of all enabled mechanisms in the KafkaServersection of the JAAS config file. For example:
    ```
        KafkaServer {
            com.sun.security.auth.module.Krb5LoginModule required
            useKeyTab=true
            storeKey=true
            keyTab="/etc/security/keytabs/kafka_server.keytab"
            principal="kafka/kafka1.hostname.com@EXAMPLE.COM";

            org.apache.kafka.common.security.plain.PlainLoginModule required
            username="admin"
            password="admin-secret"
            user_admin="admin-secret"
            user_alice="alice-secret";
        };
    ```

  2. Enable the SASL mechanisms in server.properties:
    ```
        sasl.enabled.mechanisms=GSSAPI,PLAIN
    ```

  3. Specify the SASL security protocol and mechanism for inter-broker communication in server.properties if required:
    ```
        security.inter.broker.protocol=SASL_PLAINTEXT (or SASL_SSL)
        sasl.mechanism.inter.broker.protocol=GSSAPI (or PLAIN)
    ```

  4. Follow the mechanism-specific steps in [**GSSAPI \(Kerberos\)**](http://kafka.apache.org/documentation.html#security_sasl_kerberos_brokerconfig) and [**PLAIN**](http://kafka.apache.org/documentation.html#security_sasl_plain_brokerconfig) to configure SASL for the enabled mechanisms.

6. #### [**Modifying SASL mechanism in a Running Cluster**](http://kafka.apache.org/documentation.html#saslmechanism_rolling_upgrade)

  SASL mechanism can be modified in a running cluster using the following sequence:

  1. Enable new SASL mechanism by adding the mechanism to sasl.enabled.mechanisms in server.properties for each broker. Update JAAS config file to include both mechanisms as described[**here**](http://kafka.apache.org/documentation.html#security_sasl_multimechanism). Incrementally bounce the cluster nodes.
  2. Restart clients using the new mechanism.
  3. To change the mechanism of inter-broker communication \(if this is required\), setsasl.mechanism.inter.broker.protocol in server.properties to the new mechanism and incrementally bounce the cluster again.
  4. To remove old mechanism \(if this is required\), remove the old mechanism fromsasl.enabled.mechanisms in server.properties and remove the entries for the old mechanism from JAAS config file. Incrementally bounce the cluster again.


### [**7.4 Authorization and ACLs**](http://kafka.apache.org/documentation.html#security_authz)

Kafka ships with a pluggable Authorizer and an out-of-box authorizer implementation that uses zookeeper to store all the acls. Kafka acls are defined in the general format of "Principal P is \[Allowed\/Denied\] Operation O From Host H On Resource R". You can read more about the acl structure on KIP-11. In order to add, remove or list acls you can use the Kafka authorizer CLI. By default, if a Resource R has no associated acls, no one other than super users is allowed to access R. If you want to change that behavior, you can include the following in broker.properties.

```
allow.everyone.if.no.acl.found=true
```

One can also add super users in broker.properties like the following \(note that the delimiter is semicolon since SSL user names may contain comma\).

```
super.users=User:Bob;User:Alice
```

By default, the SSL user name will be of the form "CN=writeuser,OU=Unknown,O=Unknown,L=Unknown,ST=Unknown,C=Unknown". One can change that by setting a customized PrincipalBuilder in broker.properties like the following.

```
principal.builder.class=CustomizedPrincipalBuilderClass
```

By default, the SASL user name will be the primary part of the Kerberos principal. One can change that by setting `sasl.kerberos.principal.to.local.rules` to a customized rule in broker.properties. The format of `sasl.kerberos.principal.to.local.rules` is a list where each rule works in the same way as the auth\_to\_local in [**Kerberos configuration file \(krb5.conf\)**](http://web.mit.edu/Kerberos/krb5-latest/doc/admin/conf_files/krb5_conf.html). Each rules starts with RULE: and contains an expression in the format \[n:string\]\(regexp\)s\/pattern\/replacement\/g. See the kerberos documentation for more details. An example of adding a rule to properly translate user@MYDOMAIN.COM to user while also keeping the default rule in place is:

```
sasl.kerberos.principal.to.local.rules=RULE:[1:$1@$0](.*@MYDOMAIN.COM)s/@.*//,DEFAULT
```

#### [**Command Line Interface**](http://kafka.apache.org/documentation.html#security_authz_cli)

Kafka Authorization management CLI can be found under bin directory with all the other CLIs. The CLI script is called **kafka-acls.sh**. Following lists all the options that the script supports:



| **OptionDescriptionDefaultOption type** |  |  |  |
| --- | --- | --- | --- |
| --add | Indicates to the script that user is trying to add an acl. |  | Action |
| --remove | Indicates to the script that user is trying to remove an acl. |  | Action |
| --list | Indicates to the script that user is trying to list acls. |  | Action |
| --authorizer | Fully qualified class name of the authorizer. | kafka.security.auth.SimpleAclAuthorizer | Configuration |
| --authorizer-properties | key=val pairs that will be passed to authorizer for initialization. For the default authorizer the example values are: zookeeper.connect=localhost:2181 |  | Configuration |
| --cluster | Specifies cluster as resource. |  | Resource |
| --topic \[topic-name\] | Specifies the topic as resource. |  | Resource |
| --group \[group-name\] | Specifies the consumer-group as resource. |  | Resource |
| --allow-principal | Principal is in PrincipalType:name format that will be added to ACL with Allow permission. 

You can specify multiple --allow-principal in a single command. |  | Principal |
| --deny-principal | Principal is in PrincipalType:name format that will be added to ACL with Deny permission. 

You can specify multiple --deny-principal in a single command. |  | Principal |
| --allow-host | IP address from which principals listed in --allow-principal will have access. | if --allow-principal is specified defaults to \* which translates to "all hosts" | Host |
| --deny-host | IP address from which principals listed in --deny-principal will be denied access. | if --deny-principal is specified defaults to \* which translates to "all hosts" | Host |
| --operation | Operation that will be allowed or denied.

Valid values are : Read, Write, Create, Delete, Alter, Describe, ClusterAction, All | All | Operation |
| --producer | Convenience option to add\/remove acls for producer role. This will generate acls that allows WRITE, DESCRIBE on topic and CREATE on cluster. |  | Convenience |
| --consumer | Convenience option to add\/remove acls for consumer role. This will generate acls that allows READ, DESCRIBE on topic and READ on consumer-group. |  | Convenience |

#### [**Examples**](http://kafka.apache.org/documentation.html#security_authz_examples)

* **Adding Acls**

  Suppose you want to add an acl "Principals User:Bob and User:Alice are allowed to perform Operation Read and Write on Topic Test-Topic from IP 198.51.100.0 and IP 198.51.100.1". You can do that by executing the CLI with following options:
  ```
  bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --add --allow-principal User:Bob --allow-principal User:Alice --allow-host 198.51.100.0 --allow-host 198.51.100.1 --operation Read --operation Write --topic Test-topic
  ```

  By default all principals that don't have an explicit acl that allows access for an operation to a resource are denied. In rare cases where an allow acl is defined that allows access to all but some principal we will have to use the --deny-principal and --deny-host option. For example, if we want to allow all users to Read from Test-topic but only deny User:BadBob from IP 198.51.100.3 we can do so using following commands:
  ```
  bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --add --allow-principal User:* --allow-host * --deny-principal User:BadBob --deny-host 198.51.100.3 --operation Read --topic Test-topic
  ```

  Note that \`\`--allow-host\`\` and \`\`deny-host\`\` only support IP addresses \(hostnames are not supported\). Above examples add acls to a topic by specifying --topic \[topic-name\] as the resource option. Similarly user can add acls to cluster by specifying --cluster and to a consumer group by specifying --group \[group-name\].
* **Removing Acls**

  Removing acls is pretty much the same. The only difference is instead of --add option users will have to specify --remove option. To remove the acls added by the first example above we can execute the CLI with following options:
  ```
   bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --remove --allow-principal User:Bob --allow-principal User:Alice --allow-host 198.51.100.0 --allow-host 198.51.100.1 --operation Read --operation Write --topic Test-topic 
  ```

* **List Acls**

  We can list acls for any resource by specifying the --list option with the resource. To list all acls for Test-topic we can execute the CLI with following options:
  ```
  bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --list --topic Test-topic
  ```

* **Adding or removing a principal as producer or consumer**

  The most common use case for acl management are adding\/removing a principal as producer or consumer so we added convenience options to handle these cases. In order to add User:Bob as a producer of Test-topic we can execute the following command:
  ```
   bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --add --allow-principal User:Bob --producer --topic Test-topic
  ```

  Similarly to add Alice as a consumer of Test-topic with consumer group Group-1 we just have to pass --consumer option:
  ```
   bin/kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 --add --allow-principal User:Bob --consumer --topic test-topic --group Group-1 
  ```

  Note that for consumer option we must also specify the consumer group. In order to remove a principal from producer or consumer role we just need to pass --remove option.

### [**7.5 Incorporating Security Features in a Running Cluster**](http://kafka.apache.org/documentation.html#security_rolling_upgrade)

You can secure a running cluster via one or more of the supported protocols discussed previously. This is done in phases:



* Incrementally bounce the cluster nodes to open additional secured port\(s\).
* Restart clients using the secured rather than PLAINTEXT port \(assuming you are securing the client-broker connection\).
* Incrementally bounce the cluster again to enable broker-to-broker security \(if this is required\)
* A final incremental bounce to close the PLAINTEXT port.



The specific steps for configuring SSL and SASL are described in sections [**7.2**](http://kafka.apache.org/documentation.html#security_ssl) and [**7.3**](http://kafka.apache.org/documentation.html#security_sasl). Follow these steps to enable security for your desired protocol\(s\).



The security implementation lets you configure different protocols for both broker-client and broker-broker communication. These must be enabled in separate bounces. A PLAINTEXT port must be left open throughout so brokers and\/or clients can continue to communicate.



When performing an incremental bounce stop the brokers cleanly via a SIGTERM. It's also good practice to wait for restarted replicas to return to the ISR list before moving onto the next node.



As an example, say we wish to encrypt both broker-client and broker-broker communication with SSL. In the first incremental bounce, a SSL port is opened on each node:

```
         listeners=PLAINTEXT://broker1:9091,SSL://broker1:9092
```

We then restart the clients, changing their config to point at the newly opened, secured port:

```
        bootstrap.servers = [broker1:9092,...]
        security.protocol = SSL
        ...etc
```

In the second incremental server bounce we instruct Kafka to use SSL as the broker-broker protocol \(which will use the same SSL port\):

```
        listeners=PLAINTEXT://broker1:9091,SSL://broker1:9092
        security.inter.broker.protocol=SSL
```

In the final bounce we secure the cluster by closing the PLAINTEXT port:

```
        listeners=SSL://broker1:9092
        security.inter.broker.protocol=SSL
```

Alternatively we might choose to open multiple ports so that different protocols can be used for broker-broker and broker-client communication. Say we wished to use SSL encryption throughout \(i.e. for broker-broker and broker-client communication\) but we'd like to add SASL authentication to the broker-client connection also. We would achieve this by opening two additional ports during the first bounce:

```
        listeners=PLAINTEXT://broker1:9091,SSL://broker1:9092,SASL_SSL://broker1:9093
```

We would then restart the clients, changing their config to point at the newly opened, SASL & SSL secured port:

```
        bootstrap.servers = [broker1:9093,...]
        security.protocol = SASL_SSL
        ...etc
```

The second server bounce would switch the cluster to use encrypted broker-broker communication via the SSL port we previously opened on port 9092:

```
        listeners=PLAINTEXT://broker1:9091,SSL://broker1:9092,SASL_SSL://broker1:9093
        security.inter.broker.protocol=SSL
```

The final bounce secures the cluster by closing the PLAINTEXT port.

```
       listeners=SSL://broker1:9092,SASL_SSL://broker1:9093
       security.inter.broker.protocol=SSL
```

ZooKeeper can be secured independently of the Kafka cluster. The steps for doing this are covered in section[**7.6.2**](http://kafka.apache.org/documentation.html#zk_authz_migration).

### [**7.6 ZooKeeper Authentication**](http://kafka.apache.org/documentation.html#zk_authz)

#### [**7.6.1 New clusters**](http://kafka.apache.org/documentation.html#zk_authz_new)

To enable ZooKeeper authentication on brokers, there are two necessary steps:

1. Create a JAAS login file and set the appropriate system property to point to it as described above
2. Set the configuration property zookeeper.set.acl in each broker to true

The metadata stored in ZooKeeper is such that only brokers will be able to modify the corresponding znodes, but znodes are world readable. The rationale behind this decision is that the data stored in ZooKeeper is not sensitive, but inappropriate manipulation of znodes can cause cluster disruption. We also recommend limiting the access to ZooKeeper via network segmentation \(only brokers and some admin tools need access to ZooKeeper if the new consumer and new producer are used\).

#### [**7.6.2 Migrating clusters**](http://kafka.apache.org/documentation.html#zk_authz_migration)

If you are running a version of Kafka that does not support security or simply with security disabled, and you want to make the cluster secure, then you need to execute the following steps to enable ZooKeeper authentication with minimal disruption to your operations:

1. Perform a rolling restart setting the JAAS login file, which enables brokers to authenticate. At the end of the rolling restart, brokers are able to manipulate znodes with strict ACLs, but they will not create znodes with those ACLs
2. Perform a second rolling restart of brokers, this time setting the configuration parameterzookeeper.set.acl to true, which enables the use of secure ACLs when creating znodes
3. Execute the ZkSecurityMigrator tool. To execute the tool, there is this script: .\/bin\/zookeeper-security-migration.sh with zookeeper.acl set to secure. This tool traverses the corresponding sub-trees changing the ACLs of the znodes

It is also possible to turn off authentication in a secure cluster. To do it, follow these steps:

1. Perform a rolling restart of brokers setting the JAAS login file, which enables brokers to authenticate, but setting zookeeper.set.acl to false. At the end of the rolling restart, brokers stop creating znodes with secure ACLs, but are still able to authenticate and manipulate all znodes
2. Execute the ZkSecurityMigrator tool. To execute the tool, run this script .\/bin\/zookeeper-security-migration.sh with zookeeper.acl set to unsecure. This tool traverses the corresponding sub-trees changing the ACLs of the znodes
3. Perform a second rolling restart of brokers, this time omitting the system property that sets the JAAS login file

Here is an example of how to run the migration tool:

```
./bin/zookeeper-security-migration --zookeeper.acl=secure --zookeeper.connection=localhost:2181

```

Run this to see the full list of parameters:

```
./bin/zookeeper-security-migration --help

```

#### [**7.6.3 Migrating the ZooKeeper ensemble**](http://kafka.apache.org/documentation.html#zk_authz_ensemble)

It is also necessary to enable authentication on the ZooKeeper ensemble. To do it, we need to perform a rolling restart of the server and set a few properties. Please refer to the ZooKeeper documentation for more detail:

1. [**Apache ZooKeeper documentation**](http://zookeeper.apache.org/doc/r3.4.6/zookeeperProgrammers.html#sc_ZooKeeperAccessControl)
2. [**Apache ZooKeeper wiki**](https://cwiki.apache.org/confluence/display/ZOOKEEPER/Zookeeper+and+SASL)

