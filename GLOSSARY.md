## Glossary

这里是本书中包含的相关术语及解释

# Kafka
Apache Kafka 是一个分布式流平台。

# Topic
用于划分 Message 的逻辑概念，一个 Topic 可以分布在多个 Broker 上。

# Partition
翻译为分区，他是 Kafka 横向扩展和并行化的基础，每一个 Topic 都可以被至少分为一个 Partition。

# Offset
Message 在 Partition 中的偏移量，编号顺序在 Partition 中有序。

# Consumer
消费者，从 broker 中消费 Message。

# Producer
生产者，向 broker 中发送 Message。

# Replication
Kafka 支持以 Partition 为单位对 Message 进行冗余备份，每个 Partition 都可以配置至少 1 个 Replication（当仅 1 个 Replication 时即仅该 Partition 本身）。

# Leader
每个 Replication 集合中的 Partition 都会选出一个唯一的 Leader，所有的读写请求都由 Leader 处理。其他 Replicas 从 Leader 处把数据更新同步到本地。

# Broker
Kafka 中使用 Broker 来接受 Producer 和 Consumer 的请求，并把 Message 持久化到本地磁盘。每个 Cluster 当中会选举出一个 Broker 来担任 Controller，负责处理 Partition 的 Leader 选举，协调 Partition 迁移等工作。

# ISR
`In-Sync Replica`, 是 Replicas 的一个子集，表示目前 Alive 且与 Leader 能够“Catch-up”的 Replicas 集合。由于读写都是首先落到 Leader 上，所以一般来说通过同步机制从 Leader 上拉取数据的 Replica 都会和 Leader 有一些延迟（包括了延迟时间和延迟条数两个维度），任意一个超过阈值都会把该 Replica 踢出 ISR。每个 Leader Partition 都有它自己独立的 ISR。

# Consumer Group
消费者组，各个 consumer 可以组成一个组，每个消息只能被组中的一个 consumer 消费，如果想要一个消息被多个 consumer 消费的话，那么这些 consumer 必须在不同的组。

