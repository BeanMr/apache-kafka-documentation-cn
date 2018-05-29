### [1.2 应用场景 Use Cases](#uses)<a id="uses"></a>

本章节介绍几种主流的 Apache Kafka 的应用场景。关于几个场景实践的概述可以参考[这篇博客](http://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying).

#### [信息系统 Messaging](#uses_messaging)<a id="uses_messaging"></a>

Kafka 可以作为传统信息中间件的替代产品。消息中间件可能因为各种目的被引入到系统之中（解耦生产者和消费、堆积未处理的消息）。对比其他的信息中间件，Kafka 的高吞吐量、内建分区、副本、容错等特性，使得它在大规模伸缩性消息处理应用中成为了一个很好的解决方案。

根据我们的在消息系统场景的经验，系统常常需求的吞吐量并不高，但是要求很低的点到点的延迟并且依赖 Kafka 提供的强有力的持久化功能。

在这个领域 Kafka 常常被拿来与传统的消息中间件系统进行对比，例如 [**ActiveMQ**](http://activemq.apache.org/) 或者 [**RabbitMQ**](https://www.rabbitmq.com/)。

#### [网站活动追踪 Website Activity Tracking](#uses_website)<a id="uses_website"></a>

Kafka 原本的应用场景要求它能**重建一个用户活动追踪管线**作为一个实时的发布与订阅消息源。意思就是用户在网站上的动作事件（如浏览页面、搜索、或者其它操作）被发布到每个动作对应的中心化 Topic 上。使得这些数据源能被不同场景的需求订阅到，这些场景包括实时处理、实时监控、导入 Hadoop 或用于离线处理、报表的离线数据仓库中。

活动追踪通常情况下是非常高频的，因为很多活动消息是由每个用户的页面浏览产生的。

#### [监控 Metrics](#uses_metrics)<a id="uses_metrics"></a>

Kafka 常被用来**处理操作监控数据**。这涉及到聚合统计分布式应用的数据来产生一个中心化的操作数据数据源。

#### [日志收集 Log Aggregation](#uses_logs)<a id="uses_logs"></a>

很多人把 Kafka 用作**日志收集服务**的替换方案。日志收集基础就是从服务器收集物理日志文件并将其放到统一的地方（文件服务器或者 HDFS）存储以便后续处理。Kafka 抽象了文件的细节，为日志或者事件数据提供了一个消息流的抽象。这样就可以很好的支持低延迟处理需求、多数据源需求，分布式数据消费需求。与 Scribe 或 Flume 等其它的日志收集系统相比，Kafka 提供了同样优秀的性能，基于副本的更强的持久化保证和更低的点到点的延迟。

#### [流处理 Stream Processing](#uses_streamprocessing)<a id="uses_streamprocessing"></a>

许多 Kafka 用户是在一个多级组成的处理管道中处理数据的，他们的从 Kafka 的 Topic 上消费原始数据，然后对消息进行聚合、丰富、转发到新的 Topic 用于消费或者转入下一步处理。例如，一个推荐新闻文章的处理管线可能从 RSS 数据源爬取文章内容，然后将它发布到”articles“ Topic；然后后续的处理器再对文章内容进行规范化、去重，然后将规整的文章内容发布到一个新的 Topic 上；最后的处理管线可能尝试将这个内容推荐给用户。这样的处理管线通过一个个独立的 topic 构建起了一个实时数据流图。从 0.10.0.0 开始，Kafka 提供了一个称为 [**Kafka Streams**](http://kafka.apache.org/documentation.html#streams_overview) 的轻量级但强大的流处理包来实现如上所述的处理流程。从 Kafka Streams 开始，Kafka 成为了与 [**Apache Storm**](https://storm.apache.org/) 和 [**Apache Samza**](http://samza.apache.org/) 类似的开源流处理工具的新选择。

#### [事件溯源 Event Sourcing](#uses_eventsourcing)<a id="uses_eventsourcing"></a>

[**事件溯源 Event sourcing**](http://martinfowler.com/eaaDev/EventSourcing.html) 是一种**将状态变更记录成一个时序队列**的应用设计模式。Kafka 对海量存储日志数据的支撑使得它可做这种应用非常好的后端支撑。

#### [提交日志 Commit Log](#uses_commitlog)<a id="uses_commitlog"></a>

Kafka 可以作为分布式系统的**外部提交日志服务**。这些日志可以用于节点间数据复制和失败阶段的数据重同步过程。Kafka 的 [**日志合并 log compaction**](http://kafka.apache.org/documentation.html#compaction) 功能可以很好的支撑这种应用场景。Kafka 这种应用和 [**Apache BookKeeper**](http://zookeeper.apache.org/bookkeeper/) 功能相似。
