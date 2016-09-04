# Summary

* [About Book](README.md)
* [Getting Started](010_getting_started/01_introduction.md)

  * [Introduction](010_getting_started/01_introduction.md)
  * [Use Cases](010_getting_started/05_uses.md)
  * [Quick Start](010_getting_started/10_quickstart.md)
  * [Ecosystem](010_getting_started/15_ecosystem.md)
  * [Upgrading](010_getting_started/20_upgrade.md)

* [API](020_api/01_api.md)

  * [Producer API](020_api/01_api.md)
  * [Consumer API](020_api/01_api.md)

    * [Old High Level Consumer API](020_api/01_api.md)
    * [Old Simple Consumer API](020_api/01_api.md)
    * [New Consumer API](020_api/01_api.md)

  * [Streams API](020_api/01_api.md)


* [Configuration](030_configuration/01_configuration.md)

  * [Broker Configs](030_configuration/01_configuration.md)
  * [Producer Configs](030_configuration/01_configuration.md)
  * [Consumer Configs](030_configuration/01_configuration.md)

    * [Old Consumer Configs](030_configuration/01_configuration.md)
    * [New Consumer Configs](030_configuration/01_configuration.md)

  * [Kafka Connect Configs](030_configuration/01_configuration.md)

  * [Kafka Streams Configs](030_configuration/01_configuration.md)

* [Design](/040_design/01_design.md)






* [1. Getting Started](#gettingStarted)
  * [1.1 Introduction](#introduction)
  * [1.2 Use Cases](#uses)
  * [1.3 Quick Start](#quickstart)
  * [1.4 Ecosystem](#ecosystem)
  * [1.5 Upgrading](#upgrade)

* [2. API](#api)
  * [2.1 Producer API](#producerapi)
  * [2.2 Consumer API](#consumerapi)
    * [2.2.1 Old High Level Consumer API](#highlevelconsumerapi)
    * [2.2.2 Old Simple Consumer API](#simpleconsumerapi)
    * [2.2.3 New Consumer API](#newconsumerapi)

  * [2.3 Streams API](#streamsapi)

* [3. Configuration](#configuration)
  * [3.1 Broker Configs](#brokerconfigs)
  * [3.2 Producer Configs](#producerconfigs)
  * [3.3 Consumer Configs](#consumerconfigs)
    * [3.3.1 Old Consumer Configs](#oldconsumerconfigs)
    * [3.3.2 New Consumer Configs](#newconsumerconfigs)

  * [3.4 Kafka Connect Configs](#connectconfigs)
  * [3.5 Kafka Streams Configs](#streamsconfigs)

* [4. Design](#design)
  * [4.1 Motivation](#majordesignelements)
  * [4.2 Persistence](#persistence)
  * [4.3 Efficiency](#maximizingefficiency)
  * [4.4 The Producer](#theproducer)
  * [4.5 The Consumer](#theconsumer)
  * [4.6 Message Delivery Semantics](#semantics)
  * [4.7 Replication](#replication)
  * [4.8 Log Compaction](#compaction)
  * [4.9 Quotas](#design_quotas)

* [5. Implementation](#implementation)
  * [5.1 API Design](#apidesign)
  * [5.2 Network Layer](#networklayer)
  * [5.3 Messages](#messages)
  * [5.4 Message format](#messageformat)
  * [5.5 Log](#log)
  * [5.6 Distribution](#distributionimpl)

* [6. Operations](#operations)
  * [6.1 Basic Kafka Operations](#basic_ops)
    * [Adding and removing topics](#basic_ops_add_topic)
    * [Modifying topics](#basic_ops_modify_topic)
    * [Graceful shutdown](#basic_ops_restarting)
    * [Balancing leadership](#basic_ops_leader_balancing)
    * [Checking consumer position](#basic_ops_consumer_lag)
    * [Mirroring data between clusters](#basic_ops_mirror_maker)
    * [Expanding your cluster](#basic_ops_cluster_expansion)
    * [Decommissioning brokers](#basic_ops_decommissioning_brokers)
    * [Increasing replication factor](#basic_ops_increase_replication_factor)

  * [6.2 Datacenters](#datacenters)
  * [6.3 Important Configs](#config)
    * [Important Server Configs](#serverconfig)
    * [Important Client Configs](#clientconfig)
    * [A Production Server Configs](#prodconfig)

  * [6.4 Java Version](#java)
  * [6.5 Hardware and OS](#hwandos)
    * [OS](#os)
    * [Disks and Filesystems](#diskandfs)
    * [Application vs OS Flush Management](#appvsosflush)
    * [Linux Flush Behavior](#linuxflush)
    * [Ext4 Notes](#ext4)

  * [6.6 Monitoring](#monitoring)
    * [Common monitoring metrics for producer\/consumer\/connect](#selector_monitoring)
    * [New producer monitoring](#new_producer_monitoring)
    * [New consumer monitoring](#new_consumer_monitoring)

  * [6.7 ZooKeeper](#zk)
    * [Stable Version](#zkversion)
    * [Operationalization](#zkops)


* [7. Security](#security)
  * [7.1 Security Overview](#security_overview)
  * [7.2 Encryption and Authentication using SSL](#security_ssl)
  * [7.3 Authentication using SASL](#security_sasl)
  * [7.4 Authorization and ACLs](#security_authz)
  * [7.5 Incorporating Security Features in a Running Cluster](#security_rolling_upgrade)
  * [7.6 ZooKeeper Authentication](#zk_authz)
    * [New Clusters](#zk_authz_new)
    * [Migrating Clusters](#zk_authz_migration)
    * [Migrating the ZooKeeper Ensemble](#zk_authz_ensemble)


* [8. Kafka Connect](#connect)
  * [8.1 Overview](#connect_overview)
  * [8.2 User Guide](#connect_user)
  * [8.3 Connector Development Guide](#connect_development)

* [9. Kafka Streams](#streams)
  * [9.1 Overview](#streams_overview)
  * [9.2 Developer Guide](#streams_developer)
    * [Core Concepts](#streams_concepts)
    * [Low-Level Processor API](#streams_processor)
    * [High-Level Streams DSL](#streams_dsl)



