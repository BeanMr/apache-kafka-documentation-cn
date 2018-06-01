## [5. Implementation](#implementation)<a id="implementation"></a>

### [5.1 API 设计](#apidesign)<a id="apidesign"></a>

#### [生产者 APIs](#impl_producer)<a id="impl_producer"></a>

生产者 API 是两个低等级类的封装 - `kafka.producer.SyncProducer` 和 `kafka.producer.async.AsyncProducer`.

```
class Producer {

  /* Sends the data, partitioned by key to the topic using either the */
  /* synchronous or the asynchronous producer */
  public void send(kafka.javaapi.producer.ProducerData<K,V> producerData);

  /* Sends a list of data, partitioned by key to the topic using either */
  /* the synchronous or the asynchronous producer */
  public void send(java.util.List<kafka.javaapi.producer.ProducerData<K,V>> producerData);

  /* Closes the producer and cleans up */
  public void close();

}

```

The goal is to expose all the producer functionality through a single API to the client. The new producer -

目的是为了将生产者所有的功能通过单一的 API 给客户端使用。生产者有如下特性：

* can handle queueing/buffering of multiple producer requests and asynchronous dispatch of the batched data -
  `kafka.producer.Producer` provides the ability to batch multiple produce requests (`producer.type=async`), before serializing and dispatching them to the appropriate kafka broker partition. The size of the batch can be controlled by a few config parameters. As events enter a queue, they are buffered in a queue, until either `queue.time` or `batch.size` is reached. A background thread (`kafka.producer.async.ProducerSendThread`) dequeues the batch of data and lets the`kafka.producer.EventHandler` serialize and send the data to the appropriate kafka broker partition. A custom event handler can be plugged in through the `event.handler` config parameter. At various stages of this producer queue pipeline, it is helpful to be able to inject callbacks, either for plugging in custom logging/tracing code or custom monitoring logic. This is possible by implementing the `kafka.producer.async.CallbackHandler` interface and setting `callback.handler`config parameter to that class.

* 可以处理多生产者请求的队列及缓冲，异步分发批量数据 - `kafka.producer.Producer` 提供在序列化和将请求分发到合适的 Kafka broker 分区前，**批量处理生产者请求**的能力 (`producer.type=async`)。批量数据的大小由几个配置参数决定，当时间进入队列，他们会在队列中缓冲，直到 `queue.time` 或者 `batch.size` 达到配置。一个后台进程 (`kafka.producer.async.ProducerSendThread`) 将数据批量移出队列，交由`kafka.producer.EventHandler` 进行序列化并敬数据发送到合适的 Kafka broker 分区。自定义的 event handler 可以通过 `event.handler` 配置参数来插入到处理流程。在处理队列的不同时间段，劫持回调是非常有用的，不管是插入自定义的日志或者追踪代码，或者是自定义的监控逻辑。实现 `kafka.producer.async.CallbackHandler` 接口并将 `callback.handler` 配置参数设置到实现类可以达到该目的。

* handles the serialization of data through a user-specified `Encoder`:

* 通过用户定于的 `Encoder` 来处理数据的序列化
  ```
  interface Encoder<T> {
    public Message toMessage(T data);
  }

  ```

  缺省值 is the no-op `kafka.serializer.DefaultEncoder`

* provides software load balancing through an optionally user-specified `Partitioner`:
  The routing decision is influenced by the `kafka.producer.Partitioner`.

* 通过自定义的 `Partitioner` 来实现负载均衡。routing 策略收到 `kafka.producer.Partitioner` 影响。

  ```
  interface Partitioner<T> {
     int partition(T key, int numPartitions);
  }

  ```

  分区 API 使用 key 和有效的 broker 分区序号来返回分区 id。这个 id 被用来作为排序的 `broker_ids` 和分区的一个索引来相应生产者的请求。默认的 partitioning 策略是 `hash(key)%numPartitions`. 如果 key 是 null, 那么一个随机的 broker 分区会被选定。自定义分区策略可以通过 `partitioner.class` 参数来被插入到系统。



#### [消费者 APIs](#impl_consumer)<a id="impl_consumer"></a>

我们有两个层级的消费者 APIs. 低层 "简单" API 保持一个到单一 broker 的连接，并且能够获得发送到服务器请求的更快相应。这个 API 是完全无状态的，每一次请求都需要将 offset 传递过来，允许用户维护该数据。

The high-level API hides the details of brokers from the consumer and allows consuming off the cluster of machines without concern for the underlying topology. It also maintains the state of what has been consumed. The high-level API also provides the ability to subscribe to topics that match a filter expression (i.e., either a whitelist or a blacklist regular expression).

高级 API 隐藏在 brokers 的小节中，它无需担心底层拓扑结构来消费。他同样维护着多少消息已经被消费的装填。高级 API 还提供了订阅的 topic 的过滤功能（比如一份白名单或者黑名单正则表达）

##### [下层 API](#impl_lowlevel)<a id="impl_lowlevel"></a>

```
class SimpleConsumer {

  /* Send fetch request to a broker and get back a set of messages. */
  / *将提取请求发送给 broker 并获取一组消息。 * /
  public ByteBufferMessageSet fetch(FetchRequest request);

  /* Send a list of fetch requests to a broker and get back a response set. */
  / *向 broker 发送获取请求列表并获取响应集。 * /
  public MultiFetchResponse multifetch(List<FetchRequest> fetches);

  /**
   * Get a list of valid offsets (up to maxSize) before the given time.
   * The result is a list of offsets, in descending order.
   * @param time: time in millisecs,
   *              if set to OffsetRequest$.MODULE$.LATEST_TIME(), get from the latest offset available.
   *              if set to OffsetRequest$.MODULE$.EARLIEST_TIME(), get from the earliest offset available.
   */
  public long[] getOffsetsBefore(String topic, int partition, long time, int maxNumOffsets);
}

```

The low-level API is used to implement the high-level API as well as being used directly for some of our offline consumers which have particular requirements around maintaining state.

下层 API 用于实现高级 API 以及直接用于我们的一些对维护状态有特殊要求的离线消费者。

##### [上层 API](#impl_highlevel)<a id="impl_highlevel"></a>

```
/* create a connection to the cluster */
/ *创建到群集的连接* /
ConsumerConnector connector = Consumer.create(consumerConfig);

interface ConsumerConnector {

  /**
   * This method is used to get a list of KafkaStreams, which are iterators over
   * MessageAndMetadata objects from which you can obtain messages and their
   * associated metadata (currently only topic).
   *  Input: a map of <topic, #streams>
   *  Output: a map of <topic, list of message streams>
   */
  public Map<String,List<KafkaStream>> createMessageStreams(Map<String,Int> topicCountMap);

  /**
   * You can also obtain a list of KafkaStreams, that iterate over messages
   * from topics that match a TopicFilter. (A TopicFilter encapsulates a
   * whitelist or a blacklist which is a standard Java regex.)
   */
  public List<KafkaStream> createMessageStreamsByFilter(
      TopicFilter topicFilter, int numStreams);

  /* Commit the offsets of all messages consumed so far. */
  public commitOffsets()

  /* Shut down the connector */
  public shutdown()
}
```

This API is centered around iterators, implemented by the KafkaStream class. Each KafkaStream represents the stream of messages from one or more partitions on one or more servers. Each stream is used for single threaded processing, so the client can provide the number of desired streams in the create call. Thus a stream may represent the merging of multiple server partitions (to correspond to the number of processing threads), but each partition only goes to one stream.

API 以迭代器为中心，通过 KafkaStream 类实现。每一个 KafkaStream 代表来自一台或者多台服务器上一个或者多个分区的 stream . 每一个 stream 都用于单线程处理，所以客户端可以在创建调用中提供所需流的数量。 因此一个 stream 可能代表朵儿服务器分区的合并（以应对处理线程的数量），但是每一而分区只能进入一个 stream.

The createMessageStreams call registers the consumer for the topic, which results in rebalancing the consumer/broker assignment. The API encourages creating many topic streams in a single call in order to minimize this rebalancing. The createMessageStreamsByFilter call (additionally) registers watchers to discover new topics that match its filter. Note that each stream that createMessageStreamsByFilter returns may iterate over messages from multiple topics (i.e., if multiple topics are allowed by the filter).

The createMessageStreams call registers the consumer for the topic, 这会导致调整 `custom/ broker` 分配。API 鼓励在单次调用中创建多个 topic stream，以最大限度地减少这种调整。 createMessageStreamsByFilter 调用（另外）注册观察者以发现与其过滤器匹配的新 topic。请注意，createMessageStreamsByFilter 返回的每个 stream 都可能会迭代来自多个 topic 的消息（即，如果过滤器允许多个 topic）。


### [5.2 网络层](#networklayer)<a id="networklayer"></a>

The network layer is a fairly straight-forward NIO server, and will not be described in great detail. The sendfile implementation is done by giving the `MessageSet` interface a `writeTo` method. This allows the file-backed message set to use the more efficient `transferTo` implementation instead of an in-process buffered write. The threading model is a single acceptor thread and _N_ processor threads which handle a fixed number of connections each. This design has been pretty thoroughly tested [**elsewhere**](http://sna-projects.com/blog/2009/08/introducing-the-nio-socketserver-implementation) and found to be simple to implement and fast. The protocol is kept quite simple to allow for future implementation of clients in other languages.

网络层是一个非常直接的 NIO 服务器，这里不会详细描述。 sendfile 实现是通过给`MessageSet`接口一个`writeTo`方法来完成的。这允许文件支持的消息集使用更高效的 transferTo 实现，而不是进行中的缓冲写入。线程模型是单个接受者线程和_N_处理器线程，每个线程处理固定数量的连接。这种设计已在 [**别处**](http://sna-projects.com/blog/2009/08/introducing-the-nio-socketserver-implementation) 经过相当彻底的测试，并且其实现起来很简单并且速度很快。该协议保持相当得相当简单，以便将来实现其他语言的客户端。

### [5.3 消息](#messages)<a id="messages"></a>

Messages consist of a fixed-size header, a variable length opaque key byte array and a variable length opaque value byte array. The header contains the following fields:

消息由一个固定大小的头部，一个变长 opaque 字节数组 key 和一个变长 opaque 字节数组 value 组成。标题包含以下字段：

* A CRC32 checksum to detect corruption or truncation.
*
* A format version.
* An attributes identifier
* A timestamp

Leaving the key and value opaque is the right decision: there is a great deal of progress being made on serialization libraries right now, and any particular choice is unlikely to be right for all uses. Needless to say a particular application using Kafka would likely mandate a particular serialization type as part of its usage. The`MessageSet` interface is simply an iterator over messages with specialized methods for bulk reading and writing to an NIO `Channel`.

让 key 和 value 使用 opaque 类型是一个正确的决定：在序列化库上取得了很大进展，任何特定的选择都不太可能适合所有用途。不用说使用 Kafka 的特定应用程序可能会强制使用特定的序列化类型作为其使用的一部分。 `MessageSet` 接口仅仅是一个消息迭代器，它具有用于批量读取和写入 `NIO Channel`的专用方法。


### [5.4 消息格式](#messageformat)<a id="messageformat"></a>

```
    /**
     * 1. 4 byte CRC32 of the message
     * 2. 1 byte "magic" identifier to allow format changes, value is 0 or 1
     * 3. 1 byte "attributes" identifier to allow annotations on the message independent of the version
     *    bit 0 ~ 2 : Compression codec.
     *      0 : no compression
     *      1 : gzip
     *      2 : snappy
     *      3 : lz4
     *    bit 3 : Timestamp type
     *      0 : create time
     *      1 : log append time
     *    bit 4 ~ 7 : reserved
     * 4. (Optional) 8 byte timestamp only if "magic" identifier is greater than 0
     * 5. 4 byte key length, containing length K
     * 6. K byte key
     * 7. 4 byte payload length, containing length V
     * 8. V byte payload
     */
```

### [5.5 日志](#log)<a id="log"></a>

A log for a topic named "my_topic" with two partitions consists of two directories (namely `my_topic_0` and`my_topic_1`) populated with data files containing the messages for that topic. The format of the log files is a sequence of "log entries""; each log entry is a 4 byte integer _N_ storing the message length which is followed by the _N_ message bytes. Each message is uniquely identified by a 64-bit integer _offset_ giving the byte position of the start of this message in the stream of all messages ever sent to that topic on that partition. The on-disk format of each message is given below. Each log file is named with the offset of the first message it contains. So the first file created will be 00000000000.kafka, and each additional file will have an integer name roughly _S_ bytes from the previous file where _S_ is the max log file size given in the configuration.

有两个分区名叫 `my_topic` 的日志包含两个目录（名字叫做 `my_topic_0` 和 `my_topic_1`），目录中包含着该 topic 下的消息数据。日志文件的格式是一个序列的 log entries，每一个 log entry 都是由 4 个字节 integer _N_ 和下面 _N_ 长度字节的信息组成（integer 的值即为后面跟随信息的 byte 长度）。每一个消息都由一个 64-bit integer _offset_ 来唯一标示（该字段标示消息在所有发送到 topic 并在这个分区上 stream 中开始的 byte 位置）。每一个消息的 on-disk 格式在下面给出。每一个日志文件都通过第一个消息的 offset 命名。所以第一个文件命名为 00000000000.kafka，并且每一个额外的文件都会有一个 integer 命名 _S_ bytes , 这里的 _S_ 是配置中配置的最大日志文件大小。

The exact binary format for messages is versioned and maintained as a standard interface so message sets can be transferred between producer, broker, and client without recopying or conversion when desirable. This format is as follows:

```
On-disk format of a message

offset         : 8 bytes
message length : 4 bytes (value: 4 + 1 + 1 + 8(if magic value > 0) + 4 + K + 4 + V)
crc            : 4 bytes
magic value    : 1 byte
attributes     : 1 byte
timestamp      : 8 bytes (Only exists when magic value is greater than zero)
key length     : 4 bytes
key            : K bytes
value length   : 4 bytes
value          : V bytes

```

The use of the message offset as the message id is unusual. Our original idea was to use a GUID generated by the producer, and maintain a mapping from GUID to offset on each broker. But since a consumer must maintain an ID for each server, the global uniqueness of the GUID provides no value. Furthermore the complexity of maintaining the mapping from a random id to an offset requires a heavy weight index structure which must be synchronized with disk, essentially requiring a full persistent random-access data structure. Thus to simplify the lookup structure we decided to use a simple per-partition atomic counter which could be coupled with the partition id and node id to uniquely identify a message; this makes the lookup structure simpler, though multiple seeks per consumer request are still likely. However once we settled on a counter, the jump to directly using the offset seemed natural—both after all are monotonically increasing integers unique to a partition. Since the offset is hidden from the consumer API this decision is ultimately an implementation detail and we went with the more efficient approach.

将消息偏移量用作消息 ID 是不寻常的。我们最初的想法是使用由生产者生成的 GUID，并在每个 broker 上维护从 GUID 到偏移量的映射。但是由于消费者必须为每个服务器维护一个 ID，所以 GUID 的全球唯一性没有提供任何价值。此外，维护从随机 ID 到偏移映射的复杂性需要一个重量级索引结构，它必须与磁盘同步，本质上需要一个完全持久的随机访问数据结构。因此，为了简化查找​​结构，我们决定使用一个简单的每分区原子计数器，它可以与分区 ID 和节点 ID 相结合来唯一标识一条消息；这使得查找结构更简单，尽管每个消费者请求的多个搜索仍然可能。然而，一旦我们确定了一个计数器，直接使用偏移的跳转看起来很自然 - 毕竟这是一个单独增加的独立于分区的整数。由于消费者 API 隐藏了偏移量，所以这个决定最终是一个实现细节，我们采用了更高效的方法。


![](/images/kafka_log.png)

#### [Writes](#impl_writes)<a id="impl_writes"></a>

The log allows serial appends which always go to the last file. This file is rolled over to a fresh file when it reaches a configurable size (say 1GB). The log takes two configuration parameters: _M_, which gives the number of messages to write before forcing the OS to flush the file to disk, and _S_, which gives a number of seconds after which a flush is forced. This gives a durability guarantee of losing at most _M_ messages or _S_ seconds of data in the event of a system crash.

该日志允许序列附加，它总是到最后一个文件。当文件达到可配置大小（例如 1GB ）时，该文件将被转存到新文件中。该日志有两个配置参数：_M_，它提供了在强制操作系统将文件刷新到磁盘之前要写入的消息数量，以及_S_，它给出了强制刷新之后的秒数。这提供了一个持久保证，即在系统崩溃时最多丢失_M_个消息或_S_秒的数据。


#### [Reads](#impl_reads)<a id="impl_reads"></a>

Reads are done by giving the 64-bit logical offset of a message and an _S_-byte max chunk size. This will return an iterator over the messages contained in the _S_-byte buffer. _S_ is intended to be larger than any single message, but in the event of an abnormally large message, the read can be retried multiple times, each time doubling the buffer size, until the message is read successfully. A maximum message and buffer size can be specified to make the server reject messages larger than some size, and to give a bound to the client on the maximum it needs to ever read to get a complete message. It is likely that the read buffer ends with a partial message, this is easily detected by the size delimiting.

通过给出消息的 64 位逻辑偏移量和_S_字节最大块大小来完成读操作。这将返回包含在_S_字节缓冲区中的消息的迭代器。 _S_的意图是比任何单个消息都大，但是在发生异常大的消息时，读取​​可以多次重试，每次将缓冲区大小加倍，直到消息被成功读取。可以指定最大消息和缓冲区大小，以使服务器拒绝大于某个大小的消息，并为客户端提供最大限度的绑定，以便获取完整的消息。读取缓冲区可能以部分消息结束，这很容易通过大小分界来检测。


The actual process of reading from an offset requires first locating the log segment file in which the data is stored, calculating the file-specific offset from the global offset value, and then reading from that file offset. The search is done as a simple binary search variation against an in-memory range maintained for each file.

从偏移量读取的实际过程要求首先定位存储数据的日志段文件，从全局偏移值计算文件特定的偏移量，然后从该文件偏移量中读取。搜索是按照针对每个文件保存的内存范围的简单二进制搜索变化完成的。


The log provides the capability of getting the most recently written message to allow clients to start subscribing as of "right now". This is also useful in the case the consumer fails to consume its data within its SLA-specified number of days. In this case when the client attempts to consume a non-existent offset it is given an OutOfRangeException and can either reset itself or fail as appropriate to the use case.
该日志提供了获取最近写入的消息的能力，以允许客户从“现在”开始订阅。这对于消费者未能在其 SLA 指定的天数内使用其数据的情况也是有用的。在这种情况下，当客户端尝试使用不存在的偏移量时，会给它一个 OutOfRangeException，并可以根据用例重置自身或失败。


The following is the format of the results sent to the consumer.

以下是发送给消费者的结果格式。

```
MessageSetSend (fetch result)

total length     : 4 bytes
error code       : 2 bytes
message 1        : x bytes
...
message n        : x bytes

```

```
MultiMessageSetSend (multiFetch result)

total length       : 4 bytes
error code         : 2 bytes
messageSetSend 1
...
messageSetSend n

```

#### [删除](#impl_deletes)<a id="impl_deletes"></a>

Data is deleted one log segment at a time. The log manager allows pluggable delete policies to choose which files are eligible for deletion. The current policy deletes any log with a modification time of more than _N_ days ago, though a policy which retained the last _N_ GB could also be useful. To avoid locking reads while still allowing deletes that modify the segment list we use a copy-on-write style segment list implementation that provides consistent views to allow a binary search to proceed on an immutable static snapshot view of the log segments while deletes are progressing.

数据一次删除一个日志段。日志管理器允许可插入的删除策略来选择哪些文件符合删除条件。当前策略删除所有修改时间超过_N_天的日志，尽管保留最后一个_N_ GB 的策略也可能有用。为了避免锁定读取，同时仍允许删除修改段列表，我们使用了 copy-on-write 样式段列表实现，它提供了一致的视图，以允许二进制搜索在日志段的不可变静态快照视图上继续进行，同时删除正在进行。

#### [保证](#impl_guarantees)<a id="impl_guarantees"></a>

The log provides a configuration parameter _M_ which controls the maximum number of messages that are written before forcing a flush to disk. On startup a log recovery process is run that iterates over all messages in the newest log segment and verifies that each message entry is valid. A message entry is valid if the sum of its size and offset are less than the length of the file AND the CRC32 of the message payload matches the CRC stored with the message. In the event corruption is detected the log is truncated to the last valid offset.

该日志提供了一个配置参数 _M_，用于控制强制刷新到磁盘之前写入的最大消息数。在启动时，将运行一个日志恢复进程，该进程将遍历最新日志段中的所有消息并验证每个消息条目是否有效。如果消息条目的大小和偏移量之和小于文件的长度，则消息条目有效，并且消息有效载荷的 CRC32 与存储在消息中的 CRC 相匹配。如果检测到损坏，日志将被截断为最后一个有效偏移量。

Note that two kinds of corruption must be handled: truncation in which an unwritten block is lost due to a crash, and corruption in which a nonsense block is ADDED to the file. The reason for this is that in general the OS makes no guarantee of the write order between the file inode and the actual block data so in addition to losing written data the file can gain nonsense data if the inode is updated with a new size but a crash occurs before the block containing that data is written. The CRC detects this corner case, and prevents it from corrupting the log (though the unwritten messages are, of course, lost).

请注意，必须处理两种损坏：由于崩溃导致未写入块丢失的截断以及将无意义块添加到文件的损坏。这是因为操作系统一般不能保证文件索引节点和实际块数据之间的写入顺序，所以除了丢失写入的数据之外，如果索引节点更新为新的大小，文件可以获得无意义的数据，但是在写入包含该数据的块之前发生崩溃。 CRC 检测到这个角落的情况，并防止它损坏日志（尽管未写入的消息当然丢失了）。


### [5.6 Distribution](#distributionimpl)<a id="distributionimpl"></a>

#### [消费者偏移量跟踪](#impl_offsettracking)<a id="impl_offsettracking"></a>

The high-level consumer tracks the maximum offset it has consumed in each partition and periodically commits its offset vector so that it can resume from those offsets in the event of a restart. Kafka provides the option to store all the offsets for a given consumer group in a designated broker (for that group) called the_offset manager_. i.e., any consumer instance in that consumer group should send its offset commits and fetches to that offset manager (broker). The high-level consumer handles this automatically. If you use the simple consumer you will need to manage offsets manually. This is currently unsupported in the Java simple consumer which can only commit or fetch offsets in ZooKeeper. If you use the Scala simple consumer you can discover the offset manager and explicitly commit or fetch offsets to the offset manager. A consumer can look up its offset manager by issuing a GroupCoordinatorRequest to any Kafka broker and reading the GroupCoordinatorResponse which will contain the offset manager. The consumer can then proceed to commit or fetch offsets from the offsets manager broker. In case the offset manager moves, the consumer will need to rediscover the offset manager. If you wish to manage your offsets manually, you can take a look at these [**code samples that explain how to issue OffsetCommitRequest and OffsetFetchRequest**](https://cwiki.apache.org/confluence/display/KAFKA/Committing+and+fetching+consumer+offsets+in+Kafka).

高级消费者跟踪它在每个分区中消耗的最大偏移量，并定期提交其偏移量向量，以便在重新启动时从这些偏移量恢复。 Kafka 提供了一个选项，用于存储给定用户组的所有偏移量到指定的 broker（对于该组 [『称为 the_offset manager_的组）]。即该消费者组中的任何消费者实例应该将其偏移提交和提取发送给该偏移管理器（broker）。高级用户自动处理。如果您使用简单的消费者，则需要手动管理偏移量。目前在 Java 简单使用者中不支持该功能，它只能在 ZooKeeper 中提交或提取偏移量。如果您使用 Scala 简单使用者，您可以发现偏移量管理器，并明确提交或提取偏移量管理器的偏移量。消费者可以通过向任何 Kafka broker 发放 GroupCoordinatorRequest 并阅读将包含抵消经理的 GroupCoordinatorResponse 来查找其抵消经理。消费者然后可以继续从偏移管理器 broker 处提交或提取偏移量。在偏移量管理器移动的情况下，消费者将需要重新发现偏移量管理器。如果你想手动管理你的偏移量，你可以看看这些解释如何发布 OffsetCommitRequest 和 OffsetFetchRequest **的代码示例（https://cwiki.apache.org/confluence/display/KAFKA/Committing + 和 + 取 + 消费 + 补偿 + 在 + 卡夫卡）。


When the offset manager receives an OffsetCommitRequest, it appends the request to a special [**compacted**](http://kafka.apache.org/documentation.html#compaction)Kafka topic named `__consumer_offsets`. The offset manager sends a successful offset commit response to the consumer only after all the replicas of the offsets topic receive the offsets. In case the offsets fail to replicate within a configurable timeout, the offset commit will fail and the consumer may retry the commit after backing off. (This is done automatically by the high-level consumer.) The brokers periodically compact the offsets topic since it only needs to maintain the most recent offset commit per partition. The offset manager also caches the offsets in an in-memory table in order to serve offset fetches quickly.

当偏移量管理器收到 OffsetCommitRequest 时，它会将请求附加到名为 `__consumer_offsets` 的特殊 [**压缩的**](http://kafka.apache.org/documentation.html#compaction）Kafka topic。只有在偏移量 topic 的所有副本都接收到偏移量后，偏移量管理器才会向使用方发送成功的偏移量提交响应。如果偏移无法在可配置的超时内复制，则偏移提交将失败，并且客户可能会在退出后重试提交。 （这是由高级用户自动完成的。) broker 定期压缩偏移量 topic，因为它只需要维护每个分区的最近偏移量提交。偏移量管理器还将偏移量缓存在内存表中以便快速提供偏移量提取。


When the offset manager receives an offset fetch request, it simply returns the last committed offset vector from the offsets cache. In case the offset manager was just started or if it just became the offset manager for a new set of consumer groups (by becoming a leader for a partition of the offsets topic), it may need to load the offsets topic partition into the cache. In this case, the offset fetch will fail with an OffsetsLoadInProgress exception and the consumer may retry the OffsetFetchRequest after backing off. (This is done automatically by the high-level consumer.)

当偏移量管理器接收到偏移量提取请求时，它只是从偏移量缓存中返回最后提交的偏移量向量。如果偏移量管理器刚刚启动，或者它刚刚成为新的一组消费者组的偏移量管理器（通过成为偏移量 topic 分区的领导者），则可能需要将偏移量 topic 分区加载到缓存。在这种情况下，偏移获取将失败并出现 OffsetsLoadInProgress 异常，并且客户可能会在退避后重试 OffsetFetchRequest。 （这是由高级消费者自动完成的。）


##### [将偏移从 ZooKeeper 迁移到 Kafka](#offsetmigration)<a id="offsetmigration"></a>

Kafka consumers in earlier releases store their offsets by default in ZooKeeper. It is possible to migrate these consumers to commit offsets into Kafka by following these steps:
早期版本中的 Kafka 使用者默认在 ZooKeeper 中存储它们的偏移量。通过执行以下步骤，可以将这些消费者迁移到 Kafka 中：


1. Set `offsets.storage=kafka` and `dual.commit.enabled=true` in your consumer config.
2. Do a rolling bounce of your consumers and then verify that your consumers are healthy.
3. Set `dual.commit.enabled=false` in your consumer config.
4. Do a rolling bounce of your consumers and then verify that your consumers are healthy.

1. 在消费者配置中设置`offsetsets.storage = kafka`和`dual.commit.enabled = true`。
2. 对消费者进行滚动反弹，然后确认您的消费者是否健康。
3. 在您的用户配置中设置`dual.commit.enabled = false`。
4. 对消费者进行滚动反弹，然后确认消费者是否健康。


A roll-back (i.e., migrating from Kafka back to ZooKeeper) can also be performed using the above steps if you set `offsets.storage=zookeeper`.

如果您设置了`offsets.storage = zookeeper`，则还可以使用上述步骤执行回滚（即从 Kafka 迁移回 ZooKeeper ）。

#### [ZooKeeper Directories](#impl_zookeeper)<a id="impl_zookeeper"></a>

The following gives the ZooKeeper structures and algorithms used for co-ordination between consumers and brokers.

以下给出了用于消费者和 broker 之间协调的 ZooKeeper 结构和算法。


#### [Notation](#impl_zknotation)<a id="impl_zknotation"></a>

When an element in a path is denoted [xyz], that means that the value of xyz is not fixed and there is in fact a ZooKeeper znode for each possible value of xyz. For example /topics/[topic] would be a directory named /topics containing a sub-directory for each topic name. Numerical ranges are also given such as [0...5] to indicate the subdirectories 0, 1, 2, 3, 4. An arrow -&gt; is used to indicate the contents of a znode. For example /hello -&gt; world would indicate a znode /hello containing the value "world".

当路劲中的元素表示为 [xyz] 时，意味着 xyz 值不固定，并且实际上每个可能的 xyz 值都有一个 ZooKeeper znode。例如 topics 将是一个名为 topics 目录，其中包含每个 topic 的名字的子目录。给出了数值范围 [0...5] 指示子目录 0,1,2,3,4. 箭头 `->` 用来指示 znode 的内容。比如 `/hello ->` 表示着 znode /hello 包含值 "world"。

#### [Broker 节点注册表](#impl_zkbroker)<a id="impl_zkbroker"></a>

```
/brokers/ids/[0...N] --> {"jmx_port":...,"timestamp":...,"endpoints":[...],"host":...,"version":...,"port":...} (ephemeral node)

```

This is a list of all present broker nodes, each of which provides a unique logical broker id which identifies it to consumers (which must be given as part of its configuration). On startup, a broker node registers itself by creating a znode with the logical broker id under /brokers/ids. The purpose of the logical broker id is to allow a broker to be moved to a different physical machine without affecting consumers. An attempt to register a broker id that is already in use (say because two servers are configured with the same broker id) results in an error.

这是所有当前 broker 节点的列表，每个 broker 节点都提供一个**唯一**的逻辑 broker 标识符，它将消息标识符标识给消费者（它必须作为其配置的一部分给出）。在启动时，broker 节点通过在 `/brokers/id` 下创建一个逻辑 broker ID 的 znode 来注册自己。逻辑 broker 标识的用途是允许 broker 移动到不同的物理机器而不影响用户。尝试注册已在使用中的 broker ID（也就是说因为两台服务器配置了相同的 broker ID）会导致错误。

Since the broker registers itself in ZooKeeper using ephemeral znodes, this registration is dynamic and will disappear if the broker is shutdown or dies (thus notifying consumers it is no longer available).

由于 broker 使用临时 znode 在 ZooKeeper 中注册自己，此注册是动态的，并且在 broker 关闭或死亡（从而通知消费者不再可用）时将消失。


#### [Broker Topic 注册表](#impl_zktopic)<a id="impl_zktopic"></a>

```
/brokers/topics/[topic]/partitions/[0...N]/state --> {"controller_epoch":...,"leader":...,"version":...,"leader_epoch":...,"isr":[...]} (ephemeral node)

```

Each broker registers itself under the topics it maintains and stores the number of partitions for that topic.

每个 broker 在其维护的 topic 下注册自己，并存储该 topic 的分区数量。


#### [消费者和消费者组](#impl_zkconsumers)<a id="impl_zkconsumers"></a>

Consumers of topics also register themselves in ZooKeeper, in order to coordinate with each other and balance the consumption of data. Consumers can also store their offsets in ZooKeeper by setting`offsets.storage=zookeeper`. However, this offset storage mechanism will be deprecated in a future release. Therefore, it is recommended to [**migrate offsets storage to Kafka**](http://kafka.apache.org/documentation.html#offsetmigration).

topic 的消费者也在 ZooKeeper 中注册自己，以便相互协调并平衡数据的消耗。消费者还可以通过设置`offsets.storage = zookeeper`来将他们的偏移量存储在 ZooKeeper 中。但是，此偏移量存储机制在以后的版本中将不再使用。因此，建议 [**将存储偏移量迁移到 Kafka **](http://kafka.apache.org/documentation.html#offsetmigration)。


Multiple consumers can form a group and jointly consume a single topic. Each consumer in the same group is given a shared group_id. For example if one consumer is your foobar process, which is run across three machines, then you might assign this group of consumers the id "foobar". This group id is provided in the configuration of the consumer, and is your way to tell the consumer which group it belongs to.

多个消费者可以组成一个组并共同消费一个 topic。同一组中的每个消费者都获得 `group_id`。例如，如果一个消费者是 foobar 流程，它通过三台机器运行，那么您可以为这组消费者分配 id“foobar”。该组 ID 是在消费者的配置中提供的，并且是告诉消费者它属于哪个组的消息的方式。

The consumers in a group divide up the partitions as fairly as possible, each partition is consumed by exactly one consumer in a consumer group.

组中的消费者尽可能公平地划分分区，每个分区恰好被消费者组中的一个消费者消费。


#### [Consumer Id 注册表](#impl_zkconsumerid)<a id="impl_zkconsumerid"></a>

In addition to the group_id which is shared by all consumers in a group, each consumer is given a transient, unique consumer_id (of the form hostname:uuid) for identification purposes. Consumer ids are registered in the following directory.

除了群组中的所有消费者共享的 `group_id` 外，每个消费者都会获得一个临时的唯一 `consumer_id` （形式为 hostname：uuid ）用于识别目的。消费者 ID 在以下目录中注册。


```
/consumers/[group_id]/ids/[consumer_id] --> {"version":...,"subscription":{...:...},"pattern":...,"timestamp":...} (ephemeral node)

```

Each of the consumers in the group registers under its group and creates a znode with its consumer_id. The value of the znode contains a map of &lt;topic, \#streams&gt;. This id is simply used to identify each of the consumers which is currently active within a group. This is an ephemeral node so it will disappear if the consumer process dies.

该组中的每个消费者都在其组中注册，并使用其 `consumer_id` 创建一个 znode。 znode 的值包含＆lt; topic，\＃streams＆gt; 的映射。此 ID 仅用于标识组中当前处于活动状态的每个消费者。这是一个短暂节点，所以如果消费者进程死亡，它将消失。


#### [Consumer 偏移](#impl_zkconsumeroffsets)<a id="impl_zkconsumeroffsets"></a>

Consumers track the maximum offset they have consumed in each partition. This value is stored in a ZooKeeper directory if `offsets.storage=zookeeper`.

消费者追踪他们在每个分区中消耗的最大偏移量。如果`offsetset.storage = zookeeper`，这个值存储在一个 ZooKeeper 目录中。


```
/consumers/[group_id]/offsets/[topic]/[partition_id] --> offset_counter_value ((persistent node)

```

#### [Partition Owner 注册表](#impl_zkowner)<a id="impl_zkowner"></a>

Each broker partition is consumed by a single consumer within a given consumer group. The consumer must establish its ownership of a given partition before any consumption can begin. To establish its ownership, a consumer writes its own id in an ephemeral node under the particular broker partition it is claiming.

每个 broker 分区由给定使用者组内的单个消费者使用。消费者在开始消费之前必须确定其给定分区的所有权。为了建立它的所有权，消费者将自己的 ID 写入它声称的特定 broker 分区下的临时节点中。

```
/consumers/[group_id]/owners/[topic]/[partition_id] --> consumer_node_id (ephemeral node)

```

#### [broker 节点注册](#impl_brokerregistration)<a id="impl_brokerregistration"></a>

The broker nodes are basically independent, so they only publish information about what they have. When a broker joins, it registers itself under the broker node registry directory and writes information about its host name and port. The broker also register the list of existing topics and their logical partitions in the broker topic registry. New topics are registered dynamically when they are created on the broker.

broker 节点基本上是独立的，所以它们只发布关于它们的信息。broker 加入时，它会将自身注册到 broker 节点注册目录下，并写入主机名和端口的信息。broker 还会在 broker topic 注册表中注册现有 topic 及其逻辑分区的列表。在 broker 上创建新 topic 时会动态注册新 topic 。

#### [消费者注册算法](#impl_consumerregistration)<a id="impl_consumerregistration"></a>

当消费者启动时，它将执行以下操作：

1. Register itself in the consumer id registry under its group.
2. Register a watch on changes (new consumers joining or any existing consumers leaving) under the consumer id registry. (Each change triggers rebalancing among all consumers within the group to which the changed consumer belongs.)
3. Register a watch on changes (new brokers joining or any existing brokers leaving) under the broker id registry. (Each change triggers rebalancing among all consumers in all consumer groups.)
4. If the consumer creates a message stream using a topic filter, it also registers a watch on changes (new topics being added) under the broker topic registry. (Each change will trigger re-evaluation of the available topics to determine which topics are allowed by the topic filter. A new allowed topic will trigger rebalancing among all consumers within the consumer group.)
5. Force itself to rebalance within in its consumer group.

1. 在其身处组中的消费者 ID 注册表中注册。
2. 在消费者 ID 注册表下注册更改（新消费者加入或任何现有消费者离开）。 （每次更改都会触发消费者所属的群组内的所有消费者重新调整。）
3. 在 broker ID 注册表下注册关于更改（新 broker 加入或任何现有 broker 离开）。 （每次更改都会触发所有消费群体中所有消费者之间的再平衡。）
4. 如果消费者使用 topic 过滤器创建消息流，则还会在 broker topic 注册表下的变更（添加的新 topic）注册一个监视器。（每次更改都会触发对可用 topic 的重新评估，以确定 topic 过滤器允许哪些 topic。新的允许 topic 将触发消费者组中所有消费者之间的重新调整。）
5. 强迫自己在其消费者组中重新调整。

#### [Consumer 调整算法](#impl_consumerrebalance)<a id="impl_consumerrebalance"></a>

The consumer rebalancing algorithms allows all the consumers in a group to come into consensus on which consumer is consuming which partitions. Consumer rebalancing is triggered on each addition or removal of both broker nodes and other consumers within the same group. For a given topic and a given consumer group, broker partitions are divided evenly among consumers within the group. A partition is always consumed by a single consumer. This design simplifies the implementation. Had we allowed a partition to be concurrently consumed by multiple consumers, there would be contention on the partition and some kind of locking would be required. If there are more consumers than partitions, some consumers won't get any data at all. During rebalancing, we try to assign partitions to consumers in such a way that reduces the number of broker nodes each consumer has to connect to.

消费者重新调整算法允许组中的所有消费者就哪个消费者正在消费哪些分区达成共识。每次添加或删除同一组内的 broker 节点和其他消费者时都会触发消费者重新调整。对于给定的 topic 和给定的消费者群体，broker 分区在群组内的消费者之间均匀分配。分区总是由单个用户使用。这种设计简化了实现。如果我们允许一个分区被多个消费者同时使用，那么分区上就会出现争用，并且需要某种锁定。如果消费者比分区多，一些消费者根本就得不到任何数据。在重新调整期间，我们尝试以减少每个消费者必须连接的 broker 节点数量的方式将消费分配给消费者。

Each consumer does the following during rebalancing:

```
   1. For each topic T that Ci subscribes to
   2.   let PT be all partitions producing topic T
   3.   let CG be all consumers in the same group as Ci that consume topic T
   4.   sort PT (so partitions on the same broker are clustered together)
   5.   sort CG
   6.   let i be the index position of Ci in CG and let N = size(PT)/size(CG)
   7.   assign partitions from i*N to (i+1)*N - 1 to consumer Ci
   8.   remove current entries owned by Ci from the partition owner registry
   9.   add newly assigned partitions to the partition owner registry
        (we may need to re-try this until the original partition owner releases its ownership)

```

   1. 对于 Ci 订阅的每个 topic T.
   2. 让 PT 成为产生话题 T 的所有分区
   3. 让 CG 成为消费 topic T 的与 Ci 相同的所有消费者
   4. 对 PT 进行排序（使同一 broker 上的分区聚集在一起）
   5. 排序 CG
   让我成为 CG 中 Ci 的指标位置，并让 N = 大小（PT）/ 大小（CG）
   7. 将分区从 i * N 分配给（i + 1）* N-1 到消费者 Ci
   8. 从分区所有者注册表中删除 Ci 拥有的当前条目
   9. 将新分配的分区添加到分区所有者注册表
        （我们可能需要重新尝试，直到原始分区所有者释放其所有权）



When rebalancing is triggered at one consumer, rebalancing should be triggered in other consumers within the same group about the same time.

当一个消费者触发调整时，同一时间内同一群体内的其他消费者应该重新调整。

