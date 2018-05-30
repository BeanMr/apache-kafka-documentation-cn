### [1.3 快速入门 Quick Start](#quickstart)<a id="quickstart"></a>

本教程假设你从零开始，没有 Kafka 和 ZooKeeper 历史数据。

#### [Step 1: 下载代码](#quickstart_download)<a id="quickstart_download"></a>

[**下载**](https://www.apache.org/dyn/closer.cgi?path=/kafka/0.10.0.0/kafka_2.11-0.10.0.0.tgz "Kafka downloads")  0.10.0.0 的正式版本并解压。

```bash
> tar -xzf kafka_2.11-0.10.0.0.tgz
> cd kafka_2.11-0.10.0.0

```

#### [Step 2: 启动服务器](#quickstart_startserver)<a id="quickstart_startserver"></a>

Kafka 依赖 ZooKeeper 因此你首先启动一个 ZooKeeper 服务器。如果你没有一个现成的实例，你可以使用 Kafka 包里面的默认脚本快速安装并启动一个全新的单节点 ZooKeeper 实例。

```bash
> bin/zookeeper-server-start.sh config/zookeeper.properties
[2013-04-22 15:01:37,495] INFO Reading configuration from: config/zookeeper.properties (org.apache.zookeeper.server.quorum.QuorumPeerConfig)
...

```

然后开始启动 Kafka 服务器：

```bash
> bin/kafka-server-start.sh config/server.properties
[2013-04-22 15:01:47,028] INFO Verifying properties (kafka.utils.VerifiableProperties)
[2013-04-22 15:01:47,051] INFO Property socket.send.buffer.bytes is overridden to 1048576 (kafka.utils.VerifiableProperties)
...

```

#### [Step 3: 创建 Topic](#quickstart_createtopic)<a id="quickstart_createtopic"></a>

现在我们开始创建一个名为“test”的单分区单副本的 Topic。

```bash
> bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic test

```

现在我们应该可以通过运行`list topic`命令查看到这个 topic:

```bash
> bin/kafka-topics.sh --list --zookeeper localhost:2181
test

```

另外，除了手工创建 topic 以外，你也可以将你的 brokers 配置成消息发布到一个不存在的 topic 时自动创建此 topics。

#### [Step 4: 发送消息](#quickstart_send)<a id="quickstart_send"></a>

Kafka 附带一个命令行客户端可以从文件或者标准输入中读取输入然后发送这个消息到 Kafka 集群。默认情况下每行信息被当做一个消息发送。

运行生产者脚本然后在终端中输入一些消息并发送到服务器。

```bash
> bin/kafka-console-producer.sh --broker-list localhost:9092 --topic test
This is a message
This is another message

```

#### [Step 5: 启动消费者](#quickstart_consume)<a id="quickstart_consume"></a>

Kafka 也附带了一个命令行的消费者可以导出这些消息到标准输出。

```bash
> bin/kafka-console-consumer.sh --zookeeper localhost:2181 --topic test --from-beginning
This is a message
This is another message

```

如果你在不同的终端运行以上两个命令，那么现在你就应该能在生产者的终端中键入消息同时在消费者的终端中看到。

所有的命令行工具都有很多可选的参数；不添加参数直接执行这些命令将会显示它们的使用方法，更多内容可以参考他们的使用手册。

#### [Step 6: 配置一个多节点集群](#quickstart_multibroker)<a id="quickstart_multibroker"></a>

我们已经成功的以单 broker 的模式运行起来了，但这并没有实际的意义。对于 Kafka 来说，一个单独的 broker 就是一个大小为 1 的集群，所以集群模式无非多启动几个 broker 实例。为了更好的理解，我们将集群扩展到 3 个节点。

首先为每个 broker 准备配置文件

```bash
> cp config/server.properties config/server-1.properties
> cp config/server.properties config/server-2.properties

```

修改新的配置文件的以下属性：

```
config/server-1.properties:
    broker.id=1
    listeners=PLAINTEXT://:9093
    log.dir=/tmp/kafka-logs-1

config/server-2.properties:
    broker.id=2
    listeners=PLAINTEXT://:9094
    log.dir=/tmp/kafka-logs-2

```

`broker.id` 属性指定了节点在集群中的唯一的不变的名字。我们必须更改端口和日志目录主要是因为我们在同一个机器上运行所有的上述实例，我们必须要保证 brokers 不会去注册相同端口或者覆盖其它人的数据。

我们已经有了 ZooKeeper 并且已经有一个阶段启动了，接下来我们只要启动另外两个节点。

```bash
> bin/kafka-server-start.sh config/server-1.properties &
...
> bin/kafka-server-start.sh config/server-2.properties &
...

```

现在我们可以创建一个新的 topic 并制定副本数量为 3：

```bash
> bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 3 --partitions 1 --topic my-replicated-topic

```

现在我们启动了一个集群，我们如何知道每个 broker 具体的工作呢？为了回答这个问题，可以运行`describe topics`命令：

```bash
> bin/kafka-topics.sh --describe --zookeeper localhost:2181 --topic my-replicated-topic
Topic:my-replicated-topic	PartitionCount:1	ReplicationFactor:3	Configs:
	Topic: my-replicated-topic	Partition: 0	Leader: 1	Replicas: 1,2,0	Isr: 1,2,0

```

解释一下输出的内容，第一行给出了所有 partition 的一个总结，每行给出了一个 partition 的信息。因为我们这个 topic 只有一个 partition 所以只有一行信息。

* “leader” 负责响应给定 partition 的所有读和写请求。每个节点都会是从所有 partition 集合随机选定的一个子集的“leader”
* “replicas” 是一个节点列表，包含所有复制了此 partition log 的节点，不管这个节点是否为 leader 也不管这个节点当前是否存活
* “isr” 是当前处于同步状态的副本。这是“replicas”列表的一个子集表示当前处于存活状态并且与 leader 一致的节点

注意在我们的例子中 node 1 是这个仅有一个 partition 的 topic 的 leader。

我们可以对我们原来创建的 topic 运行相同的命令，来观察它保存在哪里：

```bash
> bin/kafka-topics.sh --describe --zookeeper localhost:2181 --topic test
Topic:test	PartitionCount:1	ReplicationFactor:1	Configs:
	Topic: test	Partition: 0	Leader: 0	Replicas: 0	Isr: 0

```

我们很明显的发现原来的那个 topic 没有副本而且它在我们创建它时集群仅有的一个节点 server 0 上。

现在我们发布几个消息到我们的新 topic 上：

```bash
> bin/kafka-console-producer.sh --broker-list localhost:9092 --topic my-replicated-topic
...
my test message 1
my test message 2
^C

```

现在让我们消费这几个消息：

```bash
> bin/kafka-console-consumer.sh --zookeeper localhost:2181 --from-beginning --topic my-replicated-topic
...
my test message 1
my test message 2
^C

```

现在让我们测试一下集群容错。Broker 1 正在作为 leader 所以我们杀掉它：

```bash
> ps | grep server-1.properties
7564 ttys002    0:15.91 /System/Library/Frameworks/JavaVM.framework/Versions/1.8/Home/bin/java...
> kill -9 7564

```

集群 leader 已经切换到一个从服务器上，node 1 节点也不在出现在同步副本列表中了：

```bash
> bin/kafka-topics.sh --describe --zookeeper localhost:2181 --topic my-replicated-topic
Topic:my-replicated-topic	PartitionCount:1	ReplicationFactor:3	Configs:
	Topic: my-replicated-topic	Partition: 0	Leader: 2	Replicas: 1,2,0	Isr: 2,0

```

即使原来负责写的节点已经失效，消息仍然可以被正常消费。

```bash
> bin/kafka-console-consumer.sh --zookeeper localhost:2181 --from-beginning --topic my-replicated-topic
...
my test message 1
my test message 2
^C

```

#### [Step 7: 使用 Kafka Connect 进行数据导入导出 Use Kafka Connect to import/export data](#quickstart_kafkaconnect)<a id="quickstart_kafkaconnect"></a>

从终端写入数据，数据也写回终端很方便快速开始学习和使用 Kafka 。但是你可能更希望从其它的数据源导入或者导出 Kafka 的数据到其它的系统。相比其它系统需要自己编写集成代码，你可以直接使用 Kafka 的 Connect 直接导入或者导出数据。Kafka Connect 是 Kafka 自带的用于数据导入和导出的工具。它是一个扩展的可运行连接器 (runs _connectors_) 工具，可使用自定义的逻辑来实现与外部系统的集成交互。在这个快速入门中我们将介绍如何通过一个简单的从文本导入数据、导出数据到文本的连接器来调用 Kafka Connect。首先我们从创建一些测试的基础数据开始：


```bash
> echo -e "foo\nbar" > test.txt

```

接下来我们采用 _standalone_ 模式启动两个 connectors, 也就是让它们都运行在独立的、本地的、不同的进程中。我们提供三个参数化的配置文件，第一个提供共有的配置用于 Kafka Connect 处理，包含共有的配置比如连接哪个 Kafka broker 和数据的序列化格式。剩下的配置文件制定每个 connector 创建的特定信息。这些文件包括唯一的 connector 的名字，connector 要实例化的类和其它的一些 connector 必备的配置。

```bash
> bin/connect-standalone.sh config/connect-standalone.properties config/connect-file-source.properties config/connect-file-sink.properties

```

上述简单的配置文件已经被包含在 Kafka 的发行包中，它们将使用默认的之前我们启动的本地集群配置创建两个 connector：第一个作为源 connector 从一个文件中读取每行数据然后将他们发送 Kafka 的 topic，第二个是一个输出 (sink)connector 从 Kafka 的 topic 读取消息，然后将它们一行行输出到输出文件中。在启动的过程你将看到一些日志消息，包括一些提示 connector 正在被实例化的信息。一旦 Kafka Connect 进程启动以后，源 connector 应该开始从`test.txt`中读取数据行，并将他们发送到 topic `connect-test` 上，然后`输出 connector` 将会开始从 topic 读取消息然后把它们写入到`test.sink.txt`中。

我们可以查看输出文件来验证通过整个管线投递的数据：

```
> cat test.sink.txt
foo
bar

```

注意这些数据已经被保存到了 Kafka 的`connect-test` topic 中，所以我们还可以运行一个终端消费者来看到这些数据（或者使用自定义的消费者代码来处理数据）：

```
> bin/kafka-console-consumer.sh --zookeeper localhost:2181 --topic connect-test --from-beginning
{"schema":{"type":"string","optional":false},"payload":"foo"}
{"schema":{"type":"string","optional":false},"payload":"bar"}
...

```

connector 在持续的处理着数据，所以我们可以向文件中添加数据然后观察到它在这个管线中的传递：

```
> echo "Another line" >> test.txt

```

你应该可以观察到新的数据行出现在终端消费者中和输出文件中。

#### [Step 8: 使用 Kafka Streams 来处理数据 Use Kafka Streams to process data](#quickstart_kafkastreams)<a id="quickstart_kafkastreams"></a>

Kafka Streams 是一个用来对 Kafka brokers 中保存的数据进行实时处理和分析的客户端库。这个[入门示例](https://kafka.apache.org/11/documentation/streams/quickstart) 将演示如何启动一个采用此类库实现的流处理程序。下面是`WordCountDemo`示例代码的 GIST（为了方便阅读已经转化成了 Java 8 的 lambda 表达式）。

```
KTable wordCounts = textLines
    // 按照空格将每个文本行拆分成单词
    // Split each text line, by whitespace, into words.
    .flatMapValues(value -> Arrays.asList(value.toLowerCase().split("\\W+")))
    // 确保每个单词作为记录的 key 值以便于下一步的聚合
    // Ensure the words are available as record keys for the next aggregate operation.
    .map((key, value) -> new KeyValue<>(value, value))
    // 计算每个单词的出现频率并将他们保存到“Counts”的表中
    // Count the occurrences of each word (record key) and store the results into a table named "Counts".
    .countByKey("Counts")

```

上述代码实现了计算每个单词出现频率直方图的单词计数算法。但是它与之前常见的操作有限数据的示例相比有明显的不同，它被设计成一个操作**无边界限制的流数据**的程序。与有界算法相似它是一个有状态算法，它可以跟踪并更新单词的计数。但是它必须支持处理无边界限制的数据输入的假设，它将在处理数据的过程持续的输出自身的状态和结果，因为它不能明确的知道合适已经完成了所有输入数据的处理。


接下来我们准备一些发送到 Kafka topic 的输入数据，随后它们将被 Kafka Streams 程序处理。

```
> echo -e "all streams lead to kafka\nhello kafka streams\njoin kafka summit" > file-input.txt

```
ing\):

接下来我们使用终端生产者发送这些输入数据到名为**streams-file-input**的输入 topic（在实际应用中，流数据会是不断流入处理程序启动和运行用的 Kafka）：

```
> bin/kafka-topics.sh --create \
            --zookeeper localhost:2181 \
            --replication-factor 1 \
            --partitions 1 \
            --topic streams-file-input

```

```
> cat file-input.txt | bin/kafka-console-producer.sh --broker-list localhost:9092 --topic streams-file-input

```

现在我们可以启动 WordCount 示例程序来处理这些数据了：

```
> bin/kafka-run-class.sh org.apache.kafka.streams.examples.wordcount.WordCountDemo

```

在 STDOUT 终端不会有任何日志输出，因为所有的结果被不断的写回了另外一个名为**streams-wordcount-output**的 topic 上。这个实例将会运行一会儿，之后与典型的流处理程序不同它将会自动退出。

现在我们可以通过读取这个单词计数示例程序的输出 topic 来验证结果：

```
> bin/kafka-console-consumer.sh --zookeeper localhost:2181 \
            --topic streams-wordcount-output \
            --from-beginning \
            --formatter kafka.tools.DefaultMessageFormatter \
            --property print.key=true \
            --property print.value=true \
            --property key.deserializer=org.apache.kafka.common.serialization.StringDeserializer \
            --property value.deserializer=org.apache.kafka.common.serialization.LongDeserializer

```

以下输出数据将会被打印到终端上：

```
all     1
streams 1
lead    1
to      1
kafka   1
hello   1
kafka   2
streams 2
join    1
kafka   3
summit  1

```

可以看到，第一列是 Kafka 的消息的健，第二列是这个消息的值，他们都是`java.lang.String`格式的。注意这个输出结果实际上是一个持续更新的流，每一行（例如、上述原始输出的每一行）是一个单词更新之后的计数。对于 key 相同的多行记录，每行都是前面一行的更新。

现在你可以向**streams-file-input** topic 写入更多的消息并观察**streams-wordcount-output** topic 表述更新单词计数的新的消息。

你可以通过键入**Ctrl-C**来终止终端消费者。



