### [1.1 简介](:introduction)

Kafka是一个实现了分布式、分区、提交后复制的日志服务。它通过一套独特的设计提供了消息系统中间件的功能。

这是什么意思呢？

首先我们回顾几个基础的消息系统术语：

* Kafka将消息源放在称为_topics_的归类组维护

* 我们将发布消息到Kafka topic上的处理程序称之为_producers_

* 我们将订阅topic并处理消息源发布的信息的程序称之为_consumers_

* Kafka采用集群方式运行，集群由一台或者多台服务器构成，每个机器被称之为一个_broker_

(译者注：这些基本名词怎么翻译都觉着怪还是尽量理解下原文)

所以高度概括起来，producers(生产者)通过网络将messages(消息)发送到Kafka机器，然后由集群将这些消息提供给consumers(消费者)，如下图所示：

![](/images/producer_consumer.png)

Clients(客户端)和Servers(服务器)通过一个简单的、高效的[基于TCP的协议](https://kafka.apache.org/protocol.html)进行交互。官方为Kafka提供一个Java客户端，但更多[其他语言的客户端](https://cwiki.apache.org/confluence/display/KAFKA/Clients)可以在这里找到。

#### [Topics and Logs](#intro_topics)

Let's first dive into the high-level abstraction Kafka provides—the topic.
首先我们先来深入Kafka提供的关于Topic的高层抽象。

Topic是一个消息投递目标的名称，这个目标可以理解为一个消息归类或者消息源。对于每个Topic，Kafka会为其维护一个如下图所示的分区的日志文件：


![](/images/log_anatomy.png)

每个partition(分区)是一个有序的、不可修改的、消息组成的队列；这些消息是被不断的appended(追加)到这个commit log（提交日志文件）上的。在这些patitions之中的每个消息都会被赋予一个叫做_offset_的顺序id编号，用来在partition之中唯一性的标示这个消息。

Kafka集群会保存一个时间段内所有被发布出来的信息，无论这个消息是否已经被消费过，这个时间段是可以配置的。比如日志保存时间段被设置为2天，那么2天以内发布的消息都是可以消费的；而之前的消息为了释放空间将会抛弃掉。Kafka的性能与数据量不相干，所以保存大量的消息数据不会造成性能问题。

实际上Kafka关注的关于每个消费者的元数据信息也基本上仅仅只有这个消费者的"offset"也就是它访问到了log的哪个位置。这个offsize是由消费者控制的，通常情况下当消费者读取信息时这个数值是线性递增的，但实际上消费者可以自行随意的控制这个值从而随意控制其消费信息的顺序。例如，一个消费者可以将其重置到更早的时间来实现信息的重新处理。

这些特性组合起来就意味着Kafka消费者是非常低消耗，它们可以随意的被添加或者移除而不会对集群或者其他的消费者造成太多的干扰。例如，你可以通过我们的命令行工具"tail"(译者注：Linux的tail命令的意思)任何消息队列的内容，这不会对任何已有的消费者产生任何影响。

对log进行分区主要是为了以下几个目的：第一、这可以让log的伸缩能力超过单台服务器上线，每个独立的partition的大小受限于单台服务器的容积，但是一个topic可以有很多partition从而使得它有能力处理任意大小的数据。第二、在并行处理方面这可以作为一个独立的单元。

#### [分布式](#intro_distribution)

log的partition被分布到Kafka集群之中；每个服务器负责处理彼此共享的partition的一部分数据和请求。每个partition被复制指定的份数散布到机器之中来提供故障转移能力。


Each partition has one server which acts as the "leader" and zero or more servers which act as "followers". The leader handles all read and write requests for the partition while the followers passively replicate the leader. If the leader fails, one of the followers will automatically become the new leader. Each server acts as a leader for some of its partitions and a follower for others so load is well balanced within the cluster.



#### [Producers](#intro_producers)



Producers publish data to the topics of their choice. The producer is responsible for choosing which message to assign to which partition within the topic. This can be done in a round-robin fashion simply to balance load or it can be done according to some semantic partition function \(say based on some key in the message\). More on the use of partitioning in a second.



#### [Consumers](#intro_consumers)



Messaging traditionally has two models: [queuing](http://en.wikipedia.org/wiki/Message_queue) and [publish-subscribe](http://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern). In a queue, a pool of consumers may read from a server and each message goes to one of them; in publish-subscribe the message is broadcast to all consumers. Kafka offers a single consumer abstraction that generalizes both of these—the _consumer group_.



Consumers label themselves with a consumer group name, and each message published to a topic is delivered to one consumer instance within each subscribing consumer group. Consumer instances can be in separate processes or on separate machines.



If all the consumer instances have the same consumer group, then this works just like a traditional queue balancing load over the consumers.



If all the consumer instances have different consumer groups, then this works like publish-subscribe and all messages are broadcast to all consumers.



More commonly, however, we have found that topics have a small number of consumer groups, one for each "logical subscriber". Each group is composed of many consumer instances for scalability and fault tolerance. This is nothing more than publish-subscribe semantics where the subscriber is a cluster of consumers instead of a single process.



<div style="float: right; margin: 20px; width: 500px" class="caption"> <img src="/images/consumer-groups.png"><br> A two server Kafka cluster hosting four partitions (P0-P3) with two consumer groups. Consumer group A has two consumer instances and group B has four.</div>





Kafka has stronger ordering guarantees than a traditional messaging system, too.



A traditional queue retains messages in-order on the server, and if multiple consumers consume from the queue then the server hands out messages in the order they are stored. However, although the server hands out messages in order, the messages are delivered asynchronously to consumers, so they may arrive out of order on different consumers. This effectively means the ordering of the messages is lost in the presence of parallel consumption. Messaging systems often work around this by having a notion of "exclusive consumer" that allows only one process to consume from a queue, but of course this means that there is no parallelism in processing.



Kafka does it better. By having a notion of parallelism—the partition—within the topics, Kafka is able to provide both ordering guarantees and load balancing over a pool of consumer processes. This is achieved by assigning the partitions in the topic to the consumers in the consumer group so that each partition is consumed by exactly one consumer in the group. By doing this we ensure that the consumer is the only reader of that partition and consumes the data in order. Since there are many partitions this still balances the load over many consumer instances. Note however that there cannot be more consumer instances in a consumer group than partitions.



Kafka only provides a total order over messages _within_ a partition, not between different partitions in a topic. Per-partition ordering combined with the ability to partition data by key is sufficient for most applications. However, if you require a total order over messages this can be achieved with a topic that has only one partition, though this will mean only one consumer process per consumer group.



#### [Guarantees](#intro_guarantees)



At a high-level Kafka gives the following guarantees:



* Messages sent by a producer to a particular topic partition will be appended in the order they are sent. That is, if a message M1 is sent by the same producer as a message M2, and M1 is sent first, then M1 will have a lower offset than M2 and appear earlier in the log.

* A consumer instance sees messages in the order they are stored in the log.

* For a topic with replication factor N, we will tolerate up to N-1 server failures without losing any messages committed to the log.



More details on these guarantees are given in the design section of the documentation.

