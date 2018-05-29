## [2. API](#)

Apache Kafka 包含了新的 Java 客户端（在 org.apache.kafka.clients package 包）。它的目的是取代原来的 Scala 客户端，但是为了兼容它们将并存一段时间。老的 Scala 客户端还打包在服务器中，这些客户端在不同的 jar 保证并包含着最小的依赖。

### [2.1 生产者 API Producer API](#producerapi)<a id="producerapi"></a>

我们鼓励所有新的开发都使用新的 Java 生产者。这个客户端经过了生产环境测试并且通常情况它比原来 Scals 客户端更加快速、功能更加齐全。你可以通过添加以下示例的 Maven 坐标到客户端依赖中来使用这个新的客户端（你可以修改版本号来使用新的发布版本）：

```
	<dependency>
	    <groupId>org.apache.kafka</groupId>
	    <artifactId>kafka-clients</artifactId>
	    <version>0.10.0.0</version>
	</dependency>

```

生产者的使用演示可以在这里找到 [**javadocs**](http://kafka.apache.org/0100/javadoc/index.html?org/apache/kafka/clients/producer/KafkaProducer.html "Kafka 0.10.0 Javadoc")。

对老的 Scala 生产者 API 感兴趣的人，可以在[这里](http://kafka.apache.org/081/documentation.html#producerapi) 找到相关信息。

### [2.2 消费者 API](#consumerapi)<a id="consumerapi"></a>

在 0.9.0 发布时我们添加了一个新的 Java 消费者来取代原来的上层的（high-level）基于 ZooKeeper 的消费者和底层的（low-level）消费者 API。这个客户端被认为是测试质量 (beta quality)。为了保证用户能平滑的升级，我们还会维护老的 0.8 的消费者客户端能与 0.9 的集群协作。在下面的章节中我们将分别介绍老的 0.8 消费者 API（包括上层消费者连机器和底层简单消费者）和新的 Java 消费者 API。

#### [2.2.1 Old High Level Consumer API](#highlevelconsumerapi)<a id="highlevelconsumerapi"></a>

```java
class Consumer {
  /**
   *  Create a ConsumerConnector
   *  创建一个 ConsumerConnector
   *
   *  @param config  at the minimum, need to specify the groupid of the consumer and the zookeeper
   *                 connection string zookeeper.connect.
   *  配置参数最少要设置此消费者的 groupid 和 Zookeeper 的连接字符串 Zookeeper.connect
   */
  public static kafka.javaapi.consumer.ConsumerConnector createJavaConsumerConnector(ConsumerConfig config);
}

/**
 *  V: type of the message  消息的类型
 *  K: type of the optional key associated with the message 消息可选的 key 的类型
 */
public interface kafka.javaapi.consumer.ConsumerConnector {
  /**
   *  Create a list of message streams of type T for each topic.
   *  为每个 topic 创建一个 T 类型的消息流
   *
   *  @param topicCountMap  a map of (topic, #streams) pair
   *                        (topic, #streams) 对的 Map
   *  @param decoder a decoder that converts from Message to T
   *                 将消息转换为 T 类型的解码器
   *  @return a map of (topic, list of  KafkaStream) pairs.
   *          The number of items in the list is #streams. Each stream supports
   *          an iterator over message/metadata pairs.
   *          返回一个 (topic, KafkaStream 列表）对的 Map。list 的元素个数为#streams。每个 stream 都支持一个对 message/metadata 对的迭代器。
   */
  public <K,V> Map<String, List<KafkaStream<K,V>>>
    createMessageStreams(Map<String, Integer> topicCountMap, Decoder<K> keyDecoder, Decoder<V> valueDecoder);

  /**
   *  Create a list of message streams of type T for each topic, using the default decoder.
   *  使用默认的解码器为每个 topic 创建一个 T 类型的消息流
   */
  public Map<String, List<KafkaStream<byte[], byte[]>>> createMessageStreams(Map<String, Integer> topicCountMap);

  /**
   *  Create a list of message streams for topics matching a wildcard.
   *  为符合通配符的 topics 创建一个消息流列表
   *
   *  @param topicFilter a TopicFilter that specifies which topics to
   *                    subscribe to (encapsulates a whitelist or a blacklist).
   *                    指明哪些 topic 被订阅的 topic 过滤器（封装一个白名单或者黑名单）
   *  @param numStreams the number of message streams to return.
   *                    将返回的消息流的数量
   *  @param keyDecoder a decoder that decodes the message key
   *                    用于解码消息键的解码器
   *  @param valueDecoder a decoder that decodes the message itself
   *                    解码消息的解码器
   *  @return a list of KafkaStream. Each stream supports an
   *          iterator over its MessageAndMetadata elements.
   *          KafkaStream 的列表。每个流支持一个遍历消息及元数据元素的迭代器
   */
  public <K,V> List<KafkaStream<K,V>>
    createMessageStreamsByFilter(TopicFilter topicFilter, int numStreams, Decoder<K> keyDecoder, Decoder<V> valueDecoder);

  /**
   *  Create a list of message streams for topics matching a wildcard, using the default decoder.
   *  使用默认的解码器为符合通配符的 topic 创建消息流列表
   */
  public List<KafkaStream<byte[], byte[]>> createMessageStreamsByFilter(TopicFilter topicFilter, int numStreams);

  /**
   *  Create a list of message streams for topics matching a wildcard, using the default decoder, with one stream.
   *  使用一个流和默认的解码器为符合通配符的 topic 创建消息流列表
   */
  public List<KafkaStream<byte[], byte[]>> createMessageStreamsByFilter(TopicFilter topicFilter);

  /**
   *  Commit the offsets of all topic/partitions connected by this connector.
   *  提交连接到这个连接器的所有 topic/partition 的偏移量
   */
  public void commitOffsets();

  /**
   *  Shut down the connector
   *  关闭这个连接器
   */
  public void shutdown();
}


```

你可以参见这个[示例](https://cwiki.apache.org/confluence/display/KAFKA/Consumer+Group+Example "Kafka 0.8 consumer example") 来学习如何使用高层消费者 api。

#### [2.2.2 老的简单消费者 API Old Simple Consumer API](#simpleconsumerapi)<a id="simpleconsumerapi"></a>

```
class kafka.javaapi.consumer.SimpleConsumer {
  /**
   *  Fetch a set of messages from a topic.
   *  从一个 topic 上拉取抓取一堆消息
   *
   *  @param request specifies the topic name, topic partition, starting byte offset, maximum bytes to be fetched.
   *         request 指定 topic 名称，topic 分区，起始的比特偏移量，最大的抓取的比特量
   *  @return a set of fetched messages
   *          抓取的消息集合
   */
  public FetchResponse fetch(kafka.javaapi.FetchRequest request);

  /**
   *  Fetch metadata for a sequence of topics.
   *  抓取一个 topic 序列的元数据
   *
   *  @param request specifies the versionId, clientId, sequence of topics.
   *         request 指明 versionId，clientId，topic 序列
   *  @return metadata for each topic in the request.
   *          request 中的每个 topic 的元数据
   */
  public kafka.javaapi.TopicMetadataResponse send(kafka.javaapi.TopicMetadataRequest request);

  /**
   *  Get a list of valid offsets (up to maxSize) before the given time.
   *  获取一个在指定时间前有效偏移量（到最大数值）的列表
   *
   *  @param request a [[kafka.javaapi.OffsetRequest]] object.
   *                 一个 [[kafka.javaapi.OffsetRequest]] 对象
   *  @return a [[kafka.javaapi.OffsetResponse]] object.
   *          一个 [[kafka.javaapi.OffsetResponse]] 对象
   */
  public kafka.javaapi.OffsetResponse getOffsetsBefore(OffsetRequest request);

  /**
   * Close the SimpleConsumer.
   * 关闭 SimpleConsumer
   */
  public void close();
}

```

对于大多数应用，高层的消费者 Api 已经足够优秀了。一些应用需求的特性还没有暴露给高层消费者（比如在重启消费者时设置初始的 offset）。它们可以取代我们的底层 SimpleConsumer Api。这个逻辑可能更复杂一点，你可以参照这个[示例](https://cwiki.apache.org/confluence/display/KAFKA/0.8.0+SimpleConsumer+Example "Kafka 0.8 SimpleConsumer example")。

#### [2.2.3 新消费者 API New Consumer API](#newconsumerapi)<a id="newconsumerapi"></a>

这个新的统一的消费者 API 移除了从 0.8 开始而来的上层和底层消费者 API 的差异。你可以通过添加如下示例 Maven 坐标来添加客户端 jar 依赖来使用此客户端。

```
	<dependency>
	    <groupId>org.apache.kafka</groupId>
	    <artifactId>kafka-clients</artifactId>
	    <version>0.10.0.0</version>
	</dependency>

```

关于消费者如何使用的示例在 [**javadocs**](http://kafka.apache.org/0100/javadoc/index.html?org/apache/kafka/clients/consumer/KafkaConsumer.html "Kafka 0.9.0 Javadoc")。

### [2.3 Streams API](#streamsapi)<a id="streamsapi"></a>

我们在 0.10.0 的发布中添加了一个新的称为**Kafka Streams**客户端类库来支持用户实现存储于 Kafka Topic 的数据的流处理程序。Kafka 流处理被认定为 alpha 阶段，它的公开 API 可能在后续的版本中变更。你可以通过添加如下的 Maven 坐标来添加流处理 jar 依赖，从而使用 Kafka 流处理（你可以改变版本为新的发布版本）：

```
	<dependency>
	    <groupId>org.apache.kafka</groupId>
	    <artifactId>kafka-streams</artifactId>
	    <version>0.10.0.0</version>
	</dependency>

```

如何使用这个类库的示例在 [**javadocs**](http://kafka.apache.org/0100/javadoc/index.html?org/apache/kafka/streams/KafkaStreams.html "Kafka 0.10.0 Javadoc") 给出（注意，被注解了**@InterfaceStability.Unstable**的类标明他们的公开 API 可能在以后的发布中变更并不保证前向兼容）。
