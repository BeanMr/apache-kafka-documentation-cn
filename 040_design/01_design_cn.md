## [4. 设计](#design)<a id="design"></a>

### [4.1 设计初衷](#majordesignelements)<a id="majordesignelements"></a>

我们将 Kafka 设计为一个能处理**[大公司可能存在的](http://kafka.apache.org/documentation.html#introduction)**所有实时数据流的统一平台。为了实现这个目标我们考虑了各式各样的应用场景。

它必须有很高的**吞吐量**来支撑像实时日志合并这类大规模的事件流。

它必须能很好的处理大规模数据积压问题来支撑像线下系统周期性的导入数据的场景。

同时它也需要可以胜任**低延迟**的消息分发来支撑与传统消息机制类似的应用场景。

我们还希望它支持分区、分布式、消息流的实时创建、分发处理。这些需求促成了我们现在的分区和消费者模型。

最后在作为信息流上游为其它数据系统提供服务的场景下，我们也深知系统必须能够提供在主机故障时的**容错**担保。

为了实现对上述应用场景的支持最终导致我们设计了一系列更相似于数据库日志而不是传统消息系统的元素。我们将在后续段落中概述其中的某些设计元素。

### [4.2 持久化](#persistence)<a id="persistence"></a>

#### [不要惧怕文件系统！](#design_filesystem)<a id="design_filesystem"></a>

Kafka 在消息的存储和缓存中**重度依赖文件系统**。因为“磁盘慢”这个普遍性的认知，常常使人们怀疑一个这样的持久化结构是否能提供所需的性能。但实际上磁盘因为使用的方式不同，它可能比人们预想的慢很多也可能比人们预想的快很多；而且一个合理设计的磁盘文件结构常常可以使磁盘运行得和网络一样快。

磁盘性能的核心指标在过去的十年间已经从磁盘的寻道延迟变成了硬件驱动的吞吐量。故此在一个**[JBOD](http://en.wikipedia.org/wiki/Non-RAID_drive_architectures)** 操作的由 6 张 7200 转磁盘组成的 RAID-5 阵列之上的线性写操作的性能能达到 600MB/sec 左右，但是它的随机写性能却只有 100k/sec 左右，两者之间相差了 6000 倍以上。因为线性的读操作和写操作是最常见的磁盘应用模式，并且这也被操作系统进行了高度的优化。现在的操作系统都提供了预读取和写合并技术、即预读取数倍于数据的大文件块和将多个小的逻辑写操作合并成一个大的物理写操作的技术。关于这个话题的进一步的讨论可以参照 **[ACM Queue article](http://queue.acm.org/detail.cfm?id=1563874)**；他们发现实际上**[线性的磁盘访问在某些场景下比随机的内存访问还快！](http://deliveryimages.acm.org/10.1145/1570000/1563874/jacobs3.jpg)**

为了填补这个性能的差异，现在操作系统越来越激进地使用主内存来作为磁盘的缓冲。现代的操作系统都非常乐意将 _所有的_ 空闲的内存作为磁盘的缓存，虽然这将在内存重分配期间带来一点性能影响。所有的磁盘的读写操作都会经过这块统一的缓存。而且这个特性除非使用 direct I/O 技术很难被关闭掉，所以即使一个进程在进程内维护了数据的缓存，实际上这些数据依旧在操作系统的页缓存上存在一个副本，实际上所有的数据都被存储了两次。

另外我们是基于 JVM 进行建设的，任何一个稍微了解 Java 内存模型的人都知道以下两点：

1. 对象的内存占用是非常高，常常是数据存储空间的两倍以上（甚至更差）。

2. Java 的内存回收随着堆内数据的增长会变得更加繁琐和缓慢。

综上所述，使用文件系统和页缓存相较于维护一个内存缓存或者其它结构更占优势 -- 我们通过自动化的访问所有空闲内存的能力将缓存的空间扩大了至少两倍，之后又因为保存压缩的字节结构而不是单独对象结构又将此扩充了两倍以上。最终这使我们在一个 32G 的主机之上拥有了一个高达 28-30G 的没有 GC 问题的缓存。而且这个缓存即使在服务重启之后也能保持热度，相反进程内的缓存要么还需要重建预热（10G 的缓存可能耗时 10 分钟）要么就从一个完全空白的缓冲开始服务（这意味着初始化期间性能将很差）。同时这也很大的简化了代码，因为所有的维护缓存和文件系统之间正确性逻辑现在都在操作系统中了，这常常比重复造轮子更加高效和正确。如果你的磁盘使用方式更倾向与线性读取，预读取技术将在每次磁盘读操作时将有效的数据高效的预填充到这些缓存中。

这使人想到一个非常简单的设计：相对于竭尽所能的维护内存内结构而且要时刻注意在空间不足时谨记要将它们 flush 到文件系统中，我们可以颠覆这种做法。所有的数据被直接写入文件系统上一个可暂不执行磁盘 flush 操作的持久化日志文件中。实际上这意味着这些数据是被传送到了内核的页缓存上。

This style of pagecache-centric design is described in an [**article**](http://varnish.projects.linpro.no/wiki/ArchitectNotes) on the design of Varnish here (along with a healthy dose of arrogance).

这种基于页缓存的设计可以参见在 [**这篇关于 Varnish 的论文**](http://varnish.projects.linpro.no/wiki/ArchitectNotes)

#### [常量时间就足够](#design_constanttime)<a id="design_constanttime"></a>

消息系统使用的持久化数据结构通常是和 BTree 相关联的消费者队列或者其他用于存储消息元数据的通用随机访问数据结构。BTree 是最通用的数据结构选择，它可以在消息系统中支持各种事务性和非事务性语义。虽然 BTree 的操作复杂度是 O(logN) ，但是成本也很高。通常我们认为 O(logN) 基本等同于常数时间，但这条在磁盘操作中不成立。磁盘寻址是每 10ms 一跳，并且每个磁盘同时只能够执行一次寻址，因此并行受到了限制。因此即使是少量的磁盘寻址也会有很高的开销。由于存储系统将非常快的缓存操作和非常慢的物理磁盘操作混在一起，在确定缓存大小的情况下树结构的实际性能随着数据的增长是非线性的 -- 比如数据翻倍时性能下降不止两倍。

所以直观来看，持久化队列可以建立在简单的读取和向文件后追加两种操作之上，这和日志解决方案相同。这种结构的优点在于所有的操作复杂度都是 O(1)，而且读操作不会阻塞写操作，读操作之间也不会互相影响。这有着明显的性能优势，由于性能和数据大小完全不相关 -- 服务器现在可以充分利用大量廉价、低转速的 1+TB SATA 硬盘。 虽然这些硬盘的寻址性能很差，但他们在大规模读写方面的性能是可以接受的，而且价格是原来的三分之一、容量是原来的三倍。

在不产生任何性能损失的情况下能够访问几乎无限的硬盘空间，这意味着我们可以提供一些其它消息系统不常见的特性。例如：在 Kafka 中，我们可以让消息保留相对较长的一段时间（比如一周），而不是试图在被消费后立即删除。正如我们后面将要提到的，这给消费者带来了很大的灵活性。

### [4.3 性能 Efficiency](#maximizingefficiency)<a id="maximizingefficiency"></a>

我们在性能提升上做了很大的努力。我们的主要使用场景之一是处理网页活动信息，这个数据量非常巨大，因为每个页面都可能有大量的写入。此外我们假设发布每个 message 至少被一个 consumer （通常是多个） 来消费，因此我们尽可能去降低消费的代价。

We have also found, from experience building and running a number of similar systems, that efficiency is a key to effective multi-tenant operations. If the downstream infrastructure service can easily become a bottleneck due to a small bump in usage by the application, such small changes will often create problems. By being very fast we help ensure that the application will tip-over under load before the infrastructure. This is particularly important when trying to run a centralized service that supports dozens or hundreds of applications on a centralized cluster as changes in usage patterns are a near-daily occurrence.

从构建和运行很多相似系统的经验中我们还发现，性能是多租户操作的关键。如果下游的基础设施服务很轻易被应用层冲击形成瓶颈，那么小的改变也会造成问题。通过非常快的（缓存）技术，能够确保应用层冲击基础设施之前，将负载稳定下来。当尝试去运行支持集中式集群上成百上千个应用程序的集中式服务时，这一点非常重要，因为应用层使用方式几乎每天都会发生变化。

We discussed disk efficiency in the previous section. Once poor disk access patterns have been eliminated, there are two common causes of inefficiency in this type of system: too many small I/O operations, and excessive byte copying.

我们在上一节讨论了磁盘性能。 一旦消除了磁盘访问模式不佳的情况，该类系统性能低下的主要原因就剩下了两个：大量的小型 I/O 操作，以及过多的字节拷贝。

The small I/O problem happens both between the client and the server and in the server's own persistent operations.

小型的 I/O 操作发生在客户端和服务端之间以及服务端自身的持久化操作中。

To avoid this, our protocol is built around a "message set" abstraction that naturally groups messages together. This allows network requests to group messages together and amortize the overhead of the network roundtrip rather than sending a single message at a time. The server in turn appends chunks of messages to its log in one go, and the consumer fetches large linear chunks at a time.

为了避免这种情况，我们的协议是建立在一个 “消息块” 的抽象基础上，合理将消息分组。 这使得网络请求将多个消息打包成一组，而不是每次发送一条消息，从而使整组消息分担网络中往返的开销。Consumer 每次获取多个大型有序的消息块，并由服务端 依次将消息块一次加载到它的日志中。

This simple optimization produces orders of magnitude speed up. Batching leads to larger network packets, larger sequential disk operations, contiguous memory blocks, and so on, all of which allows Kafka to turn a bursty stream of random message writes into linear writes that flow to the consumers.

这个简单的优化对速度有着数量级的提升。批处理允许更大的网络数据包，更大的顺序读写磁盘操作，连续的内存块等等，所有这些都使 KafKa 将随机流消息顺序写入到磁盘， 再由 consumers 进行消费。

The other inefficiency is in byte copying. At low message rates this is not an issue, but under load the impact is significant. To avoid this we employ a standardized binary message format that is shared by the producer, the broker, and the consumer (so data chunks can be transferred without modification between them).

另一个低效率的操作是字节拷贝，在消息量少时，这不是什么问题。但是在高负载的情况下，影响就不容忽视。为了避免这种情况，我们让 producer ，broker 和 consumer 都共享的标准化的二进制消息格式，这样数据块不用修改就能在他们之间传递。

The message log maintained by the broker is itself just a directory of files, each populated by a sequence of message sets that have been written to disk in the same format used by the producer and consumer. Maintaining this common format allows optimization of the most important operation: network transfer of persistent log chunks. Modern unix operating systems offer a highly optimized code path for transferring data out of pagecache to a socket; in Linux this is done with the **[sendfile system call](http://man7.org/linux/man-pages/man2/sendfile.2.html)**.

broker 维护的消息日志本身就是一个文件目录，每个文件都由一系列以相同格式写入到磁盘的消息集合组成，这种写入格式被 producer 和 consumer 共用。保持这种通用格式可以对一些很重要的操作进行优化：持久化日志块的网络传输。 现代的 unix 操作系统提供了一个高度优化的编码方式，用于将数据从 pagecache 转移到 socket 网络连接中；在 Linux 中系统调用 [sendfile](http://man7.org/linux/man-pages/man2/sendfile.2.html) 做到这一点。

To understand the impact of sendfile, it is important to understand the common data path for transfer of data from file to socket:

为了理解 sendfile 的意义，了解数据从文件到套接字的常见数据传输路径就非常重要：

1. The operating system reads data from the disk into pagecache in kernel space
2. The application reads the data from kernel space into a user-space buffer
3. The application writes the data back into kernel space into a socket buffer
4. The operating system copies the data from the socket buffer to the NIC buffer where it is sent over the network

1. 操作系统从磁盘读取数据到内核空间的 pagecache
2. 应用程序读取内核空间的数据到用户空间的缓冲区
3. 应用程序将数据（用户空间的缓冲区）写回内核空间到套接字缓冲区（内核空间）
4. 操作系统将数据从套接字缓冲区（内核空间）复制到通过网络发送的 NIC 缓冲区

This is clearly inefficient, there are four copies and two system calls. Using sendfile, this re-copying is avoided by allowing the OS to send the data from pagecache to the network directly. So in this optimized path, only the final copy to the NIC buffer is needed.

这显然是低效的，有四次 copy 操作和两次系统调用。使用 sendfile 方法，可以允许操作系统将数据从 pagecache 直接发送到网络，这样避免重新复制数据。所以这种优化方式，只需要最后一步的 copy 操作，将数据复制到 NIC 缓冲区。

We expect a common use case to be multiple consumers on a topic. Using the zero-copy optimization above, data is copied into pagecache exactly once and reused on each consumption instead of being stored in memory and copied out to kernel space every time it is read. This allows messages to be consumed at a rate that approaches the limit of the network connection.

我们期望的一个使用场景是一个 topic 被多个消费者消费。使用 zero-copy （零拷贝）优化，数据在使用时只会被复制到 pagecache 中一次，节省了每次拷贝到用户空间内存中，在从用户空间进行读取的消耗。这使得消息能够以接近网络连接的速度被消费。

This combination of pagecache and sendfile means that on a Kafka cluster where the consumers are mostly caught up you will see no read activity on the disks whatsoever as they will be serving data entirely from cache.

pagecache 和 sendfile 的组合使用意味着，在一个 Kafka 集群中，大多数的 consumer 消费时，将看不到磁盘上的读取活动，因为数据完全由缓存提供。

For more background on the sendfile and zero-copy support in Java, see this **[article](http://www.ibm.com/developerworks/linux/library/j-zerocopy)**.

Java 中更多关于 sendfile 方法和 zero-copy （零拷贝） 相关的资料，可以参考这里的[文章](http://www.ibm.com/developerworks/linux/library/j-zerocopy)

#### [端到端批量压缩](#design_compression)<a id="design_compression"></a>

In some cases the bottleneck is actually not CPU or disk but network bandwidth. This is particularly true for a data pipeline that needs to send messages between data centers over a wide-area network. Of course the user can always compress its messages one at a time without any support needed from Kafka, but this can lead to very poor compression ratios as much of the redundancy is due to repetition between messages of the same type (e.g. field names in JSON or user agents in web logs or common string values). Efficient compression requires compressing multiple messages together rather than compressing each message individually.

某些情况下，数据传输的瓶颈不是 CPU，也不是磁盘，而是网络带宽。尤其是当数据消息通道需要在数据中心通过广域网进行传输时。当然用户可以在不需要 Kafka 支持下一次一个压缩消息，但这样会造成非常差的压缩率和消息重复类型冗余，比如 JSON 中字段名称或者是 Web 日志中用户代理或者是公共字符串值。高性能的压缩是一次压缩多个消息，而不是单独压缩。

Kafka supports this by allowing recursive message sets. A batch of messages can be clumped together compressed and sent to the server in this form. This batch of messages will be written in compressed form and will remain compressed in the log and will only be decompressed by the consumer.

Kafka 以高效的批处理格式支持一批消息可以压缩在一起发送到服务器。这批消息将以压缩格式写入，并且在日志中保持压缩，只会在 consumer 消费时解压缩。

Kafka supports GZIP, Snappy and LZ4 compression protocols. More details on compression can be found **[here](https://cwiki.apache.org/confluence/display/KAFKA/Compression)**.

Kafka 支持 GZIP，Snappy 和 LZ4 压缩协议，更多有关压缩的资料参看[这里](https://cwiki.apache.org/confluence/display/KAFKA/Compression)。

### [4.4 The Producer](#theproducer)<a id="theproducer"></a>

#### [Load balancing](#design_loadbalancing)<a id="design_loadbalancing"></a>

The producer sends data directly to the broker that is the leader for the partition without any intervening routing tier. To help the producer do this all Kafka nodes can answer a request for metadata about which servers are alive and where the leaders for the partitions of a topic are at any given time to allow the producer to appropriately direct its requests.

生产者直接发送数据到主分区的服务器上，不需要经过任何中间路由。为了让生产者实现这个功能，所有的 kafka 服务器节点都能响应这样的元数据请求： 哪些服务器是活着的，主题的哪些分区是主分区，分配在哪个服务器上，这样生产者就能适当地直接发送它的请求到服务器上。

The client controls which partition it publishes messages to. This can be done at random, implementing a kind of random load balancing, or it can be done by some semantic partitioning function. We expose the interface for semantic partitioning by allowing the user to specify a key to partition by and using this to hash to a partition (there is also an option to override the partition function if need be). For example if the key chosen was a user id then all data for a given user would be sent to the same partition. This in turn will allow consumers to make locality assumptions about their consumption. This style of partitioning is explicitly designed to allow locality-sensitive processing in consumers.

客户端控制消息发送数据到哪个分区，这个可以实现随机的负载均衡方式，或者使用一些特定语义的分区函数。我们有提供特定分区的接口让用于根据指定的键值进行 hash 分区（当然也有选项可以重写分区函数），例如，如果使用用户 ID 作为 key，则用户相关的所有数据都会被分发到同一个分区上。这允许消费者在消费数据时做一些特定的本地化处理。这样的分区风格经常被设计用于一些对本地处理比较敏感的消费者。

#### [Asynchronous send](#design_asyncsend)<a id="design_asyncsend"></a>

Batching is one of the big drivers of efficiency, and to enable batching the Kafka producer will attempt to accumulate data in memory and to send out larger batches in a single request. The batching can be configured to accumulate no more than a fixed number of messages and to wait no longer than some fixed latency bound (say 64k or 10 ms). This allows the accumulation of more bytes to send, and few larger I/O operations on the servers. This buffering is configurable and gives a mechanism to trade off a small amount of additional latency for better throughput.

批处理是提升性能的一个主要驱动，为了允许批量处理，kafka 生产者会尝试在内存中汇总数据，并用一次请求批次提交信息。 批处理，不仅仅可以配置指定的消息数量，也可以指定等待特定的延迟时间（如 64k 或 10ms)，这允许汇总更多的数据后再发送，在服务器端也会减少更多的 IO 操作。 该缓冲是可配置的，并给出了一个机制，通过权衡少量额外的延迟时间获取更好的吞吐量。

更多的细节可以在 producer 的 **[configuration](http://kafka.apache.org/documentation.html#producerconfigs)** 和 **[api](http://kafka.apache.org/082/javadoc/index.html?org/apache/kafka/clients/producer/KafkaProducer.html)** 文档中进行详细的了解。

### [4.5 消费者](#theconsumer)<a id="theconsumer"></a>

The Kafka consumer works by issuing "fetch" requests to the brokers leading the partitions it wants to consume. The consumer specifies its offset in the log with each request and receives back a chunk of log beginning from that position. The consumer thus has significant control over this position and can rewind it to re-consume data if need be.

Kafka consumer 通过向 broker 发出一个“fetch”请求来获取它想要消费的 partition。consumer 的每个请求都在 log 中指定了对应的 offset，并接收从该位置开始的一大块数据。因此，consumer 对于该位置的控制就显得极为重要，并且可以在需要的时候通过回退到该位置再次消费对应的数据。

#### [Push vs. pull](#design_pull)<a id="design_pull"></a>

An initial question we considered is whether consumers should pull data from brokers or brokers should push data to the consumer. In this respect Kafka follows a more traditional design, shared by most messaging systems, where data is pushed to the broker from the producer and pulled from the broker by the consumer. Some logging-centric systems, such as **[Scribe](http://github.com/facebook/scribe)** and **[Apache Flume](http://flume.apache.org/)**, follow a very different push-based path where data is pushed downstream. There are pros and cons to both approaches. However, a push-based system has difficulty dealing with diverse consumers as the broker controls the rate at which data is transferred. The goal is generally for the consumer to be able to consume at the maximum possible rate; unfortunately, in a push system this means the consumer tends to be overwhelmed when its rate of consumption falls below the rate of production (a denial of service attack, in essence). A pull-based system has the nicer property that the consumer simply falls behind and catches up when it can. This can be mitigated with some kind of backoff protocol by which the consumer can indicate it is overwhelmed, but getting the rate of transfer to fully utilize (but never over-utilize) the consumer is trickier than it seems. Previous attempts at building systems in this fashion led us to go with a more traditional pull model.

我们最初考虑的问题是：究竟是由 consumer 从 broker 那边 pull 数据，还是由 broker 将数据 push 到 consumer。Kafka 在这里采取了一种较为传统的设计方式，也是大多数的消息系统所共享的方式：即 producer 把数据 push 到 broker，然后 consumer 从 broker 中 pull 数据。也有一些 logging-centric 的系统，比如 [Scribe](http://github.com/facebook/scribe) 和 [Apache Flume](http://flume.apache.org/) ，沿着一条完全不同的 push-based 的路径，将数据 push 到下游节点。这两种方法都有优缺点。然而，由于 broker 控制着数据传输速率，所以 push-based 系统很难处理不同的 consumer。让 broker 控制数据传输速率主要是为了让 consumer 能够以可能的最大速率消费；然而不幸的是，这导致着在 push-based 的系统中，当消费速率低于生产速率时，consumer 往往会不堪重负（本质上类似于拒绝服务攻击）。pull-based 系统有一个很好的特性，那就是当 consumer 速率落后于 producer 时，可以在适当的时间赶上来。还可以通过使用某种 backoff 协议来减少这种现象：即 consumer 可以通过 backoff 表示它已经不堪重负了，然而通过获得负载情况来充分使用 consumer（但永远不超载）这一方式实现起来比它看起来更棘手。之前以这种方式构建系统的尝试，引导着 Kafka 走向了更传统的 pull 模型。

Another advantage of a pull-based system is that it lends itself to aggressive batching of data sent to the consumer. A push-based system must choose to either send a request immediately or accumulate more data and then send it later without knowledge of whether the downstream consumer will be able to immediately process it. If tuned for low latency, this will result in sending a single message at a time only for the transfer to end up being buffered anyway, which is wasteful. A pull-based design fixes this as the consumer always pulls all available messages after its current position in the log (or up to some configurable max size). So one gets optimal batching without introducing unnecessary latency.

另一个 pull-based 系统的优点在于：它可以大批量生产要发送给 consumer 的数据。而 push-based 系统必须选择立即发送请求或者积累更多的数据，然后在不知道下游的 consumer 能否立即处理它的情况下发送这些数据。如果系统调整为低延迟状态，这就会导致一次只发送一条消息，以至于传输的数据不再被缓冲，这种方式是极度浪费的。 而 pull-based 的设计修复了该问题，因为 consumer 总是将所有可用的（或者达到配置的最大长度）消息 pull 到 log 当前位置的后面，从而使得数据能够得到最佳的处理而不会引入不必要的延迟。

The deficiency of a naive pull-based system is that if the broker has no data the consumer may end up polling in a tight loop, effectively busy-waiting for data to arrive. To avoid this we have parameters in our pull request that allow the consumer request to block in a "long poll" waiting until data arrives (and optionally waiting until a given number of bytes is available to ensure large transfer sizes).

简单的 pull-based 系统的不足之处在于：如果 broker 中没有数据，consumer 可能会在一个紧密的循环中结束轮询，实际上 busy-waiting 直到数据到来。为了避免 busy-waiting，我们在 pull 请求中加入参数，使得 consumer 在一个“long pull”中阻塞等待，直到数据到来（还可以选择等待给定字节长度的数据来确保传输长度）。

You could imagine other possible designs which would be only pull, end-to-end. The producer would locally write to a local log, and brokers would pull from that with consumers pulling from them. A similar type of "store-and-forward" producer is often proposed. This is intriguing but we felt not very suitable for our target use cases which have thousands of producers. Our experience running persistent data systems at scale led us to feel that involving thousands of disks in the system across many applications would not actually make things more reliable and would be a nightmare to operate. And in practice we have found that we can run a pipeline with strong SLAs at large scale without a need for producer persistence.

你可以想象其它可能只基于 pull 、end-to-end 的设计，例如 producer 直接将数据写入一个本地的 log，然后 broker 从 producer 那里 pull 数据，最后 consumer 从 broker 中 pull 数据。通常提到的还有“store-and-forward”式 producer， 这是一种很有趣的设计，但我们觉得它跟我们设定的有数以千计的生产者的应用场景不太相符。我们在运行大规模持久化数据系统方面的经验使我们感觉到，横跨多个应用、涉及数千磁盘的系统事实上并不会让事情更可靠，反而会成为操作时的噩梦。在实践中，我们发现可以通过大规模运行的带有强大的 SLAs 的 pipeline，而省略 producer 的持久化过程。

#### [消费者位置](#design_consumerposition)<a id="design_consumerposition"></a>

Keeping track of _what_ has been consumed is, surprisingly, one of the key performance points of a messaging system.

令人惊讶的是，持续追踪_已经被消费的内容_是消息系统的关键性能点之一。

Most messaging systems keep metadata about what messages have been consumed on the broker. That is, as a message is handed out to a consumer, the broker either records that fact locally immediately or it may wait for acknowledgement from the consumer. This is a fairly intuitive choice, and indeed for a single machine server it is not clear where else this state could go. Since the data structures used for storage in many messaging systems scale poorly, this is also a pragmatic choice--since the broker knows what is consumed it can immediately delete it, keeping the data size small.

大多数消息系统都在 broker 上保存被消费消息的元数据。也就是说，当消息被传递给 consumer，broker 要么立即在本地记录该事件，要么等待 consumer 的确认后再记录。这是一种相当直接的选择，而且事实上对于单机服务器来说，也没其它地方能够存储这些状态信息。由于大多数消息系统用于存储的数据结构规模都很小，所以这也是一个很实用的选择 -- 因为只要 broker 知道哪些消息被消费了，就可以在本地立即进行删除，一直保持较小的数据量。

What is perhaps not obvious is that getting the broker and consumer to come into agreement about what has been consumed is not a trivial problem. If the broker records a message as **consumed** immediately every time it is handed out over the network, then if the consumer fails to process the message (say because it crashes or the request times out or whatever) that message will be lost. To solve this problem, many messaging systems add an acknowledgement feature which means that messages are only marked as **sent** not **consumed** when they are sent; the broker waits for a specific acknowledgement from the consumer to record the message as**consumed**. This strategy fixes the problem of losing messages, but creates new problems. First of all, if the consumer processes the message but fails before it can send an acknowledgement then the message will be consumed twice. The second problem is around performance, now the broker must keep multiple states about every single message (first to lock it so it is not given out a second time, and then to mark it as permanently consumed so that it can be removed). Tricky problems must be dealt with, like what to do with messages that are sent but never acknowledged.

也许不太明显，但要让 broker 和 consumer 就被消费的数据保持一致性也不是一个小问题。如果 broker 在每条消息被发送到网络的时候，立即将其标记为 **consumed**，那么一旦 consumer 无法处理该消息（可能由 consumer 崩溃或者请求超时或者其他原因导致），该消息就会**丢失**。 为了解决消息丢失的问题，许多消息系统增加了确认机制：即当消息被发送出去的时候，消息仅被标记为 **sent** 而不是 **consumed**；然后 broker 会等待一个来自 consumer 的特定确认，再将消息标记为 **consumed**。这个策略修复了消息丢失的问题，但也产生了新问题。首先，如果 consumer 处理了消息但在发送确认之前出错了，那么该消息就会被消费两次。第二个是关于性能的，现在 broker 必须为每条消息保存多个状态（首先对其加锁，确保该消息只被发送一次，然后将其永久的标记为 consumed，以便将其移除）。还有更棘手的问题要处理，比如如何处理已经发送但一直得不到确认的消息。

Kafka handles this differently. Our topic is divided into a set of totally ordered partitions, each of which is consumed by one consumer at any given time. This means that the position of a consumer in each partition is just a single integer, the offset of the next message to consume. This makes the state about what has been consumed very small, just one number for each partition. This state can be periodically checkpointed. This makes the equivalent of message acknowledgements very cheap.

Kafka 使用完全不同的方式**解决消息丢失问题**。Kafka 的 topic 被**分割成了一组完全有序的 partition**，其中每一个 partition 在**任意给定的时间内**只能**被每个订阅了这个 topic 的 consumer 组中的一个 consumer 消费**。这意味着 partition 中 每一个 consumer 的位置仅仅是一个数字，即下一条要消费的消息的 offset。这使得被消费的消息的状态信息相当少，每个 partition 只需要一个数字。这个状态信息还可以作为周期性的 checkpoint。这以非常低的代价实现了和消息确认机制等同的效果。

There is a side benefit of this decision. A consumer can deliberately _rewind_ back to an old offset and re-consume data. This violates the common contract of a queue, but turns out to be an essential feature for many consumers. For example, if the consumer code has a bug and is discovered after some messages are consumed, the consumer can re-consume those messages once the bug is fixed.

这种方式还有一个附加的好处。consumer 可以_回退_到之前的 offset 来再次消费之前的数据，这个操作违反了队列的基本原则，但事实证明对大多数 consumer 来说这是一个必不可少的特性。 例如，如果 consumer 的代码有 bug，并且在 bug 被发现前已经有一部分数据被消费了，那么 consumer 可以在 bug 修复后通过回退到之前的 offset 来再次消费这些数据。


#### [离线数据加载](#design_offlineload)<a id="design_offlineload"></a>

Scalable persistence allows for the possibility of consumers that only periodically consume such as batch data loads that periodically bulk-load data into an offline system such as Hadoop or a relational data warehouse.

可伸缩的持久化特性允许 consumer 只进行周期性的消费，例如批量数据加载，周期性将数据加载到诸如 Hadoop 和关系型数据库之类的离线系统中。

In the case of Hadoop we parallelize the data load by splitting the load over individual map tasks, one for each node/topic/partition combination, allowing full parallelism in the loading. Hadoop provides the task management, and tasks which fail can restart without danger of duplicate data—they simply restart from their original position.

在 Hadoop 的应用场景中，我们通过将数据加载分配到多个独立的 map 任务来实现并行化，每一个 map 任务负责一个 node/topic/partition，从而达到充分并行化。Hadoop 提供了任务管理机制，失败的任务可以重新启动而不会有重复数据的风险，只需要简单的从原来的位置重启即可。

### [4.6 消息交付语义](#semantics)<a id="semantics"></a>

Now that we understand a little about how producers and consumers work, let's discuss the semantic guarantees Kafka provides between producer and consumer. Clearly there are multiple possible message delivery guarantees that could be provided:

现在我们对于 producer 和 consumer 的工作原理已将有了一点了解，让我们接着讨论 Kafka 在 producer 和 consumer 之间提供的语义保证。显然，Kafka 可以提供的消息交付语义保证有多种：

* _At most once_ - 消息可能会丢失但绝不重传
* _At least once_ - 消息可以重传但绝不丢失
* _Exactly once_ - 这可能是用户真正想要的，每条消息只被传递一次

It's worth noting that this breaks down into two problems: the durability guarantees for publishing a message and the guarantees when consuming a message.

值得注意的是，这个问题被分成了两部分：发布消息的持久性保证和消费消息的保证。

Many systems claim to provide "exactly once" delivery semantics, but it is important to read the fine print, most of these claims are misleading (i.e. they don't translate to the case where consumers or producers can fail, cases where there are multiple consumer processes, or cases where data written to disk can be lost).

很多系统声称提供了“Exactly once”的消息交付语义，然而阅读它们的细则很重要，因为这些声称大多数都是误导性的 （即它们没有考虑 consumer 或 producer 可能失败的情况，以及存在多个 consumer 进行处理的情况，或者写入磁盘的数据可能丢失的情况。).

Kafka's semantics are straight-forward. When publishing a message we have a notion of the message being "committed" to the log. Once a published message is committed it will not be lost as long as one broker that replicates the partition to which this message was written remains "alive". The definition of alive as well as a description of which types of failures we attempt to handle will be described in more detail in the next section. For now let's assume a perfect, lossless broker and try to understand the guarantees to the producer and consumer. If a producer attempts to publish a message and experiences a network error it cannot be sure if this error happened before or after the message was committed. This is similar to the semantics of inserting into a database table with an autogenerated key.

Kafka 的语义是直截了当的。发布消息时，我们会有一个消息的概念被“committed”到 log 中。一旦消息被提交，只要有一个 broker **备份**了该消息写入的 partition，并且保持“**alive**”状态，该消息就不会丢失。有关 committed message 和 alive partition 的定义，以及我们试图解决的故障类型都将在下一节进行细致描述。现在让我们假设存在完美无缺的 broker，然后来试着理解 Kafka 对 producer 和 consumer 的语义保证。如果一个 producer 在试图发送消息的时候发生了网络故障，则不确定网络错误发生在消息提交之前还是之后。这与使用自动生成的键插入到数据库表中的语义场景很相似。

These are not the strongest possible semantics for publishers. Although we cannot be sure of what happened in the case of a network error, it is possible to allow the producer to generate a sort of "primary key" that makes retrying the produce request idempotent. This feature is not trivial for a replicated system because of course it must work even (or especially) in the case of a server failure. With this feature it would suffice for the producer to retry until it receives acknowledgement of a successfully committed message at which point we would guarantee the message had been published exactly once. We hope to add this in a future Kafka version.

Not all use cases require such strong guarantees. For uses which are latency sensitive we allow the producer to specify the durability level it desires. If the producer specifies that it wants to wait on the message being committed this can take on the order of 10 ms. However the producer can also specify that it wants to perform the send completely asynchronously or that it wants to wait only until the leader (but not necessarily the followers) have the message.

并非所有使用场景都需要这么强的保证。对于延迟敏感的应用场景，我们允许生产者指定它需要的持久性级别。如果 producer 指定了它想要等待消息被提交，则可以使用 10ms 的量级。然而， producer 也可以指定它想要完全异步地执行发送，或者它只想等待直到 leader 节点拥有该消息（follower 节点有没有无所谓）。

Now let's describe the semantics from the point-of-view of the consumer. All replicas have the exact same log with the same offsets. The consumer controls its position in this log. If the consumer never crashed it could just store this position in memory, but if the consumer fails and we want this topic partition to be taken over by another process the new process will need to choose an appropriate position from which to start processing. Let's say the consumer reads some messages -- it has several options for processing the messages and updating its position.

现在让我们从 consumer 的视角来描述该语义。所有的副本都有相同的 log 和相同的 offset。consumer 负责控制它在 log 中的位置。如果 consumer 永远不崩溃，那么它可以将这个位置信息只存储在内存中。但如果 consumer 发生了故障，我们希望这个 topic partition 被另一个进程接管， 那么新进程需要选择一个合适的位置开始进行处理。假设 consumer 要读取一些消息——它有几个处理消息和更新位置的选项。

1. It can read the messages, then save its position in the log, and finally process the messages. In this case there is a possibility that the consumer process crashes after saving its position but before saving the output of its message processing. In this case the process that took over processing would start at the saved position even though a few messages prior to that position had not been processed. This corresponds to "at-most-once" semantics as in the case of a consumer failure messages may not be processed.

1. Consumer 可以先读取消息，然后将它的位置保存到 log 中，最后再对消息进行处理。在这种情况下，消费者进程可能会在保存其位置之后，在还没有保存消息处理的输出之前发生崩溃。而在这种情况下，即使在此位置之前的一些消息没有被处理，接管处理的进程将从保存的位置开始。在 consumer 发生故障的情况下，这对应于“at-most-once”的语义，可能会有消息得不到处理。

2. It can read the messages, process the messages, and finally save its position. In this case there is a possibility that the consumer process crashes after processing messages but before saving its position. In this case when the new process takes over the first few messages it receives will already have been processed. This corresponds to the "at-least-once" semantics in the case of consumer failure. In many cases messages have a primary key and so the updates are idempotent (receiving the same message twice just overwrites a record with another copy of itself).

2. Consumer 可以先读取消息，然后处理消息，最后再保存它的位置。在这种情况下，消费者进程可能会在处理了消息之后，但还没有保存位置之前发生崩溃。而在这种情况下，当新的进程接管后，它最初收到的一部分消息都已经被处理过了。在 consumer 发生故障的情况下，这对应于“at-least-once”的语义。在许多应用场景中，消息都设有一个主键，所以更新操作是幂等的（相同的消息接收两次时，第二次写入会覆盖掉第一次写入的记录）。

3. So what about exactly once semantics (i.e. the thing you actually want)? The limitation here is not actually a feature of the messaging system but rather the need to co-ordinate the consumer's position with what is actually stored as output. The classic way of achieving this would be to introduce a two-phase commit between the storage for the consumer position and the storage of the consumers output. But this can be handled more simply and generally by simply letting the consumer store its offset in the same place as its output. This is better because many of the output systems a consumer might want to write to will not support a two-phase commit. As an example of this, our Hadoop ETL that populates data in HDFS stores its offsets in HDFS with the data it reads so that it is guaranteed that either data and offsets are both updated or neither is. We follow similar patterns for many other data systems which require these stronger semantics and for which the messages do not have a primary key to allow for deduplication.

那么 exactly once 语义（即你真正想要的东西）呢？这里的问题其实不是消息系统的特性而是需要协调 consumer 的位置和实际上被存储的结果。传统的做法是在 consumer 位置存储和 consumer 输出存储之间引入 two-phase commit。但通过让 consumer 在相同的位置保存 offset 和输出可以让这一问题变得简单。 这也是一种更好的方式，因为大多数 consumer 想写入的输出系统都不支持 two-phase commit。举个例子，Kafka Connect 连接器，它将所读取的数据和数据的 offset 一起写入到 HDFS，以保证数据和 offset 都被更新，或者两者都不被更新。 对于其它很多需要这些较强语义，并且没有主键来避免消息重复的数据系统，我们也遵循类似的模式。

So effectively Kafka guarantees at-least-once delivery by default and allows the user to implement at most once delivery by disabling retries on the producer and committing its offset prior to processing a batch of messages. Exactly-once delivery requires co-operation with the destination storage system but Kafka provides the offset which makes implementing this straight-forward.

Kafka 默认保证 at-least-once 的消息交付， 并且 Kafka 允许用户通过禁用 producer 的重传功能和让 consumer 在处理一批消息之前提交 offset，来实现 at-most-once 的消息交付。

### [4.7 Replication](#replication)<a id="replication"></a>

Kafka replicates the log for each topic's partitions across a configurable number of servers (you can set this replication factor on a topic-by-topic basis). This allows automatic failover to these replicas when a server in the cluster fails so messages remain available in the presence of failures.

Kafka 允许 topic 的 partition 拥有若干副本，你可以在 server 端配置 partition 的副本数量。当集群中的节点出现故障时，能自动进行故障转移，保证数据的可用性。

Other messaging systems provide some replication-related features, but, in our (totally biased) opinion, this appears to be a tacked-on thing, not heavily used, and with large downsides: slaves are inactive, throughput is heavily impacted, it requires fiddly manual configuration, etc. Kafka is meant to be used with replication by default—in fact we implement un-replicated topics as replicated topics where the replication factor is one.

其他的消息系统也提供了副本相关的特性，但是在我们（带有偏见）看来，他们的副本功能不常用，而且有很大缺点：slaves 处于非活动状态，导致吞吐量受到严重影响，并且还需要手动配置副本机制。Kafka 默认使用备份机制，事实上，我们将没有设置副本数的 topic 实现为副本数为 1 的 topic 。

The unit of replication is the topic partition. Under non-failure conditions, each partition in Kafka has a single leader and zero or more followers. The total number of replicas including the leader constitute the replication factor. All reads and writes go to the leader of the partition. Typically, there are many more partitions than brokers and the leaders are evenly distributed among brokers. The logs on the followers are identical to the leader's log—all have the same offsets and messages in the same order (though, of course, at any given time the leader may have a few as-yet unreplicated messages at the end of its log).

创建副本的单位是 topic 的 partition ，正常情况下，每个分区都有一个 leader 和零或多个 followers 。总的副本数是包含 leader 的总和。所有的读写操作都由 leader 处理，一般 partition 的数量都比 broker 的数量多的多，各分区的 leader 均匀的分布在 brokers 中。所有的 followers 节点都同步 leader 节点的日志，日志中的消息和偏移量都和 leader 中的一致。（当然，在任何给定时间，leader 节点的日志末尾时可能有几个消息尚未被备份完成）。

Followers consume messages from the leader just as a normal Kafka consumer would and apply them to their own log. Having the followers pull from the leader has the nice property of allowing the follower to naturally batch together log entries they are applying to their log.

Followers 节点就像普通的 consumer 那样从 leader 节点那里拉取消息并保存在自己的日志文件中。Followers 节点可以从 leader 节点那里批量拉取消息日志到自己的日志文件中。

As with most distributed systems automatically handling failures requires having a precise definition of what it means for a node to be "alive". For Kafka node liveness has two conditions

与大多数分布式系统一样，自动处理故障需要精确定义节点 “alive” 的概念。Kafka 判断节点是否存活有两种方式。

1. A node must be able to maintain its session with ZooKeeper (via ZooKeeper's heartbeat mechanism)
2. If it is a slave it must replicate the writes happening on the leader and not fall "too far" behind

1. 节点必须可以维护和 ZooKeeper 的连接，Zookeeper 通过心跳机制检查每个节点的连接。
2. 如果节点是个 follower ，它必须能及时的同步 leader 的写操作，并且延时不能太久。

We refer to nodes satisfying these two conditions as being "in sync" to avoid the vagueness of "alive" or "failed". The leader keeps track of the set of "in sync" nodes. If a follower dies, gets stuck, or falls behind, the leader will remove it from the list of in sync replicas. The determination of stuck and lagging replicas is controlled by the replica.lag.time.max.ms configuration.

我们认为满足这两个条件的节点处于 “in sync” 状态，区别于 “alive” 和 “failed” 。Leader 会追踪所有 “in sync” 的节点。如果有节点挂掉了，或是写超时，或是心跳超时，leader 就会把它从同步副本列表中移除。 同步超时和写超时的时间由 replica.lag.time.max.ms 配置确定。

In distributed systems terminology we only attempt to handle a "fail/recover" model of failures where nodes suddenly cease working and then later recover (perhaps without knowing that they have died). Kafka does not handle so-called "Byzantine" failures in which nodes produce arbitrary or malicious responses (perhaps due to bugs or foul play).

分布式系统中，我们只尝试处理 “fail/recover” 模式的故障，即节点突然停止工作，然后又恢复（节点可能不知道自己曾经挂掉）的状况。Kafka 没有处理所谓的 “Byzantine” 故障，即一个节点出现了随意响应和恶意响应（可能由于 bug 或 非法操作导致）。

A message is considered "committed" when all in sync replicas for that partition have applied it to their log. Only committed messages are ever given out to the consumer. This means that the consumer need not worry about potentially seeing a message that could be lost if the leader fails. Producers, on the other hand, have the option of either waiting for the message to be committed or not, depending on their preference for tradeoff between latency and durability. This preference is controlled by the acks setting that the producer uses.

当所有的分区上 in sync repicas 都应用到 log 上时，消息可以认为是 "committed"，只有 committed 消息才会给 consumer。这意味着 consumer 不需要担心潜在因为 leader 失败而丢失消息。而对于 producer 来说，可以依据 latency 和 durability 来权衡选择是否等待消息被 committed ，这个行动由 producer 使用的 acks 设置来决定。

The guarantee that Kafka offers is that a committed message will not be lost, as long as there is at least one in sync replica alive, at all times.

在所有时间里，Kafka 保证只要有至少一个同步中的节点存活，提交的消息就不会丢失。

Kafka will remain available in the presence of node failures after a short fail-over period, but may not remain available in the presence of network partitions.

节点挂掉后，经过短暂的故障转移后，Kafka 将仍然保持可用性，但在网络分区（ network partitions ）的情况下可能不能保持可用性。

#### [Replicated Logs: Quorums, ISRs, and State Machines (Oh my!)](#design_replicatedlog)<a id="design_replicatedlog"></a>

At its heart a Kafka partition is a replicated log. The replicated log 是分布式数据系统重基础的要素之一，实现方法有很多种。A replicated log can be used by other systems as a primitive for implementing other distributed systems in the **[state-machine style](http://en.wikipedia.org/wiki/State_machine_replication)**.

A replicated log models the process of coming into consensus on the order of a series of values (generally numbering the log entries 0, 1, 2, ...). There are many ways to implement this, but the simplest and fastest is with a leader who chooses the ordering of values provided to it. As long as the leader remains alive, all followers need to only copy the values and ordering the leader chooses.

备份日志按照一系列有序的值（通常是编号为 0、1、2、…) 进行建模。有很多方法可以实现这一点，但最简单和最快的方法是由 leader 节点选择需要提供的有序的值，只要 leader 节点还存活，所有的 follower 只需要拷贝数据并按照 leader 节点的顺序排序。

Of course if leaders didn't fail we wouldn't need followers! When the leader does die we need to choose a new leader from among the followers. But followers themselves may fall behind or crash so we must ensure we choose an up-to-date follower. The fundamental guarantee a log replication algorithm must provide is that if we tell the client a message is committed, and the leader fails, the new leader we elect must also have that message. This yields a tradeoff: if the leader waits for more followers to acknowledge a message before declaring it committed then there will be more potentially electable leaders.

If you choose the number of acknowledgements required and the number of logs that must be compared to elect a leader such that there is guaranteed to be an overlap, then this is called a Quorum.

A common approach to this tradeoff is to use a majority vote for both the commit decision and the leader election. This is not what Kafka does, but let's explore it anyway to understand the tradeoffs. Let's say we have 2_f_+1 replicas. If _f_+1 replicas must receive a message prior to a commit being declared by the leader, and if we elect a new leader by electing the follower with the most complete log from at least _f_+1 replicas, then, with no more than _f_ failures, the leader is guaranteed to have all committed messages. This is because among any _f_+1 replicas, there must be at least one replica that contains all committed messages. That replica's log will be the most complete and therefore will be selected as the new leader. There are many remaining details that each algorithm must handle (such as precisely defined what makes a log more complete, ensuring log consistency during leader failure or changing the set of servers in the replica set) but we will ignore these for now.

This majority vote approach has a very nice property: the latency is dependent on only the fastest servers. That is, if the replication factor is three, the latency is determined by the faster slave not the slower one.

There are a rich variety of algorithms in this family including ZooKeeper's **[Zab](http://www.stanford.edu/class/cs347/reading/zab.pdf)**, **[Raft](https://ramcloud.stanford.edu/wiki/download/attachments/11370504/raft.pdf)**, and **[Viewstamped Replication](http://pmg.csail.mit.edu/papers/vr-revisited.pdf)**. The most similar academic publication we are aware of to Kafka's actual implementation is**[PacificA](http://research.microsoft.com/apps/pubs/default.aspx?id=66814)** from Microsoft.

The downside of majority vote is that it doesn't take many failures to leave you with no electable leaders. To tolerate one failure requires three copies of the data, and to tolerate two failures requires five copies of the data. In our experience having only enough redundancy to tolerate a single failure is not enough for a practical system, but doing every write five times, with 5x the disk space requirements and 1/5th the throughput, is not very practical for large volume data problems. This is likely why quorum algorithms more commonly appear for shared cluster configuration such as ZooKeeper but are less common for primary data storage. For example in HDFS the namenode's high-availability feature is built on a **[majority-vote-based journal](http://blog.cloudera.com/blog/2012/10/quorum-based-journaling-in-cdh4-1)**, but this more expensive approach is not used for the data itself.

大多数投票的缺点是，多数的节点挂掉让你不能选择 leader。要冗余单点故障需要三份数据，并且要冗余两个故障需要五份的数据。根据我们的经验，在一个系统中，仅仅靠冗余来避免单点故障是不够的，但是每写 5 次，对磁盘空间需求是 5 倍， 吞吐量下降到 1/5，这对于处理海量数据问题是不切实际的。这可能是为什么 quorum 算法更常用于共享集群配置（如 ZooKeeper ）， 而不适用于原始数据存储的原因，例如 HDFS 中 namenode 的高可用是建立在[基于投票的元数据](http://blog.cloudera.com/blog/2012/10/quorum-based-journaling-in-cdh4-1)，这种代价高昂的存储方式不适用数据本身。

Kafka takes a slightly different approach to choosing its quorum set. Instead of majority vote, Kafka dynamically maintains a set of in-sync replicas (ISR) that are caught-up to the leader. Only members of this set are eligible for election as leader. A write to a Kafka partition is not considered committed until _all_ in-sync replicas have received the write. This ISR set is persisted to ZooKeeper whenever it changes. Because of this, any replica in the ISR is eligible to be elected leader. This is an important factor for Kafka's usage model where there are many partitions and ensuring leadership balance is important. With this ISR model and _f+1_ replicas, a Kafka topic can tolerate _f_ failures without losing committed messages.

Kafka 采取了一种稍微不同的方法来选择它的投票集。 Kafka 不是用大多数投票选择 leader 。Kafka 动态维护了一个同步状态的备份的集合 （a set of in-sync replicas）， 简称 ISR ，在这个集合中的节点都是和 leader 保持高度一致的，只有这个集合的成员才 有资格被选举为 leader，一条消息必须被这个集合 所有 节点读取并追加到日志中了，这条消息才能视为提交。这个 ISR 集合发生变化会在 ZooKeeper 持久化，正因为如此，这个集合中的任何一个节点都有资格被选为 leader 。这对于 Kafka 使用模型中，有很多分区和并确保主从关系是很重要的。因为 ISR 模型和 f+1 副本，一个 Kafka topic 冗余 f 个节点故障而不会丢失任何已经提交的消息。

For most use cases we hope to handle, we think this tradeoff is a reasonable one. In practice, to tolerate _f_failures, both the majority vote and the ISR approach will wait for the same number of replicas to acknowledge before committing a message (e.g. to survive one failure a majority quorum needs three replicas and one acknowledgement and the ISR approach requires two replicas and one acknowledgement). The ability to commit without the slowest servers is an advantage of the majority vote approach. However, we think it is ameliorated by allowing the client to choose whether they block on the message commit or not, and the additional throughput and disk space due to the lower required replication factor is worth it.

我们认为对于希望处理的大多数场景这种策略是合理的。在实际中，为了冗余 f 节点故障，大多数投票和 ISR 都会在提交消息前确认相同数量的备份被收到（例如在一次故障生存之后，大多数的 quorum 需要三个备份节点和一次确认，ISR 只需要两个备份节点和一次确认），多数投票方法的一个优点是提交时能避免最慢的服务器。但是，我们认为通过允许客户端选择是否阻塞消息提交来改善，和所需的备份数较低而产生的额外的吞吐量和磁盘空间是值得的。

Another important design distinction is that Kafka does not require that crashed nodes recover with all their data intact. It is not uncommon for replication algorithms in this space to depend on the existence of "stable storage" that cannot be lost in any failure-recovery scenario without potential consistency violations. There are two primary problems with this assumption. First, disk errors are the most common problem we observe in real operation of persistent data systems and they often do not leave data intact. Secondly, even if this were not a problem, we do not want to require the use of fsync on every write for our consistency guarantees as this can reduce performance by two to three orders of magnitude. Our protocol for allowing a replica to rejoin the ISR ensures that before rejoining, it must fully re-sync again even if it lost unflushed data in its crash.

另一个重要的设计区别是，Kafka 不要求崩溃的节点恢复所有的数据，在这种空间中的复制算法经常依赖于存在 “稳定存储”，在没有违反潜在的一致性的情况下，出现任何故障再恢复情况下都不会丢失。 这个假设有两个主要的问题。首先，我们在持久性数据系统的实际操作中观察到的最常见的问题是磁盘错误，并且它们通常不能保证数据的完整性。其次，即使磁盘错误不是问题，我们也不希望在每次写入时都要求使用 fsync 来保证一致性， 因为这会使性能降低两到三个数量级。我们的协议能确保备份节点重新加入 ISR 之前，即使它挂时没有新的数据，它也必须完整再一次同步数据。

#### [Unclean leader election: 如果节点全挂？](#design_uncleanleader)<a id="design_uncleanleader"></a>

Note that Kafka's guarantee with respect to data loss is predicated on at least one replica remaining in sync. If all the nodes replicating a partition die, this guarantee no longer holds.

请注意，Kafka 对于数据不会丢失的保证，是基于至少一个节点在保持同步状态，一旦分区上的所有备份节点都挂了，就无法保证了。

However a practical system needs to do something reasonable when all the replicas die. If you are unlucky enough to have this occur, it is important to consider what will happen. There are two behaviors that could be implemented:

但是，实际在运行的系统需要去考虑假设一旦所有的备份都挂了，怎么去保证数据不会丢失，这里有两种实现的方法

1. Wait for a replica in the ISR to come back to life and choose this replica as the leader (hopefully it still has all its data).
2. Choose the first replica (not necessarily in the ISR) that comes back to life as the leader.

1. 等待一个 ISR 的副本重新恢复正常服务，并选择这个副本作为领 leader （它有极大可能拥有全部数据）。
2. 选择第一个重新恢复正常服务的副本（不一定是 ISR 中的）作为 leader。

This is a simple tradeoff between availability and consistency. If we wait for replicas in the ISR, then we will remain unavailable as long as those replicas are down. If such replicas were destroyed or their data was lost, then we are permanently down. If, on the other hand, a non-in-sync replica comes back to life and we allow it to become leader, then its log becomes the source of truth even though it is not guaranteed to have every committed message. By default Kafka chooses the second strategy and favor choosing a potentially inconsistent replica when all replicas in the ISR are dead. This behavior can be disabled using configuration property unclean.leader.election.enable, to support use cases where downtime is preferable to inconsistency.

这是可用性和一致性之间的简单妥协，如果我只等待 ISR 的备份节点，那么只要 ISR 备份节点都挂了，我们的服务将一直会不可用，如果它们的数据损坏了或者丢失了，那就会是长久的宕机。另一方面，如果不是 ISR 中的节点恢复服务并且我们允许它成为 leader ，那么它的数据就是可信的来源，即使它不能保证记录了每一个已经提交的消息。kafka 默认选择第二种策略，当所有的 ISR 副本都挂掉时，会选择一个可能不同步的备份作为 leader ，可以配置属性 unclean.leader.election.enable 禁用此策略，那么就会使用第 一种策略即停机时间优于不同步。

This dilemma is not specific to Kafka. It exists in any quorum-based scheme. For example in a majority voting scheme, if a majority of servers suffer a permanent failure, then you must either choose to lose 100% of your data or violate consistency by taking what remains on an existing server as your new source of truth.

这种困境不只有 Kafka 遇到，它存在于任何 quorum-based 规则中。例如，在大多数投票算法当中，如果大多数服务器永久性的挂了，那么您要么选择丢失 100% 的数据，要么违背数据的一致性选择一个存活的服务器作为数据可信的来源。

#### [可用性和持久性保证](#design_ha)<a id="design_ha"></a>

When writing to Kafka, producers can choose whether they wait for the message to be acknowledged by 0,1 or all (-1) replicas. Note that "acknowledgement by all replicas" does not guarantee that the full set of assigned replicas have received the message. By default, when acks=all, acknowledgement happens as soon as all the current in-sync replicas have received the message. For example, if a topic is configured with only two replicas and one fails (i.e., only one in sync replica remains), then writes that specify acks=all will succeed. However, these writes could be lost if the remaining replica also fails. Although this ensures maximum availability of the partition, this behavior may be undesirable to some users who prefer durability over availability. Therefore, we provide two topic-level configurations that can be used to prefer message durability over availability:

向 Kafka 写数据时，producers 设置 ack 是否提交完成，0：不等待 broker 返回确认消息，1: leader 保存成功返回或，-1(all): 所有备份都保存成功返回。请注意。设置 “ack = all” 并不能保证所有的副本都写入了消息。默认情况下，当 acks = all 时，只要 ISR 副本同步完成，就会返回消息已经写入。例如，一个 topic 仅仅设置了两个副本，那么只有一个 ISR 副本，那么当设置 acks = all 时返回写入成功时，剩下了的那个副本数据也可能数据没有写入。尽管这确保了分区的最大可用性，但是对于偏好数据持久性而不是可用性的一些用户，可能不想用这种策略，因此，我们提供了两个 topic 配置，可用于优先配置消息数据持久性：

1. Disable unclean leader election - if all replicas become unavailable, then the partition will remain unavailable until the most recent leader becomes available again. This effectively prefers unavailability over the risk of message loss. See the previous section on Unclean Leader Election for clarification.
2. Specify a minimum ISR size - the partition will only accept writes if the size of the ISR is above a certain minimum, in order to prevent the loss of messages that were written to just a single replica, which subsequently becomes unavailable. This setting only takes effect if the producer uses acks=all and guarantees that the message will be acknowledged by at least this many in-sync replicas. This setting offers a trade-off between consistency and availability. A higher setting for minimum ISR size guarantees better consistency since the message is guaranteed to be written to more replicas which reduces the probability that it will be lost. However, it reduces availability since the partition will be unavailable for writes if the number of in-sync replicas drops below the minimum threshold.


- 禁用 unclean leader 选举机制 - 如果所有的备份节点都挂了，分区数据就会不可用，直到最近的 leader 恢复正常。这种策略优先于数据丢失的风险，参看上一节的 unclean leader 选举机制。
- 指定最小的 ISR 集合大小，只有当 ISR 的大小大于最小值，分区才能接受写入操作，以防止仅写入单个备份的消息丢失造成消息不可用的情况，这个设置只有在生产者使用 acks = all 的情况下才会生效，这至少保证消息被 ISR 副本写入。此设置是一致性和可用性 之间的折衷，对于设置更大的最小 ISR 大小保证了更好的一致性，因为它保证将消息被写入了更多的备份，减少了消息丢失的可能性。但是，这会降低可用性，因为如果 ISR 副本的数量低于最小阈值，那么分区将无法写入。

#### [备份管理](#design_replicamanagment)<a id="design_replicamanagment"></a>

The above discussion on replicated logs really covers only a single log, i.e. one topic partition. However a Kafka cluster will manage hundreds or thousands of these partitions. We attempt to balance partitions within a cluster in a round-robin fashion to avoid clustering all partitions for high-volume topics on a small number of nodes. Likewise we try to balance leadership so that each node is the leader for a proportional share of its partitions.

上面关于 replicated logs 的讨论仅仅局限于单一 log ，比如一个 topic 分区。但是 Kafka 集群需要管理成百上千个这样的分区。我们尝试轮流的方式来在集群中平衡分区来避免在小节点上处理大容量的 topic。Likewise we try to balance leadership so that each node is the leader for a proportional share of its partitions.

It is also important to optimize the leadership election process as that is the critical window of unavailability. A naive implementation of leader election would end up running an election per partition for all partitions a node hosted when that node failed. Instead, we elect one of the brokers as the "controller". This controller detects failures at the broker level and is responsible for changing the leader of all affected partitions in a failed broker. The result is that we are able to batch together many of the required leadership change notifications which makes the election process far cheaper and faster for a large number of partitions. If the controller fails, one of the surviving brokers will become the new controller.

同样关于 leadership 选举的过程也同样的重要，这段时间可能是无法服务的间隔。一个原始的 leader 选举实现是当一个节点失败时会在所有的分区节点中选主。相反，我们选用 broker 之一作为 "controller", 这个 controller 检测 broker 失败，并且为所有受到影响的分区改变 leader。这个结果是我们能够将许多需要变更 leadership 的通知整合到一起，让选举过程变得更加容易和快速。如果 controller 失败了，存活的 broker 之一会变成新的 controller。

### [4.8 日志压缩](#compaction)<a id="compaction"></a>

Log compaction ensures that Kafka will always retain at least the last known value for each message key within the log of data for a single topic partition. It addresses use cases and scenarios such as restoring state after application crashes or system failure, or reloading caches after application restarts during operational maintenance. Let's dive into these use cases in more detail and then describe how compaction works.

日志压缩可确保 Kafka 始终至少为单个 topic partition 的数据日志中的每个 message key 保留最新的已知值。这样的设计解决了应用程序崩溃、系统故障后恢复或者应用在运行维护过程中重启后重新加载缓存的场景。接下来让我们深入讨论这些在使用过程中的更多细节，阐述在这个过程中它是如何进行日志压缩的。

So far we have described only the simpler approach to data retention where old log data is discarded after a fixed period of time or when the log reaches some predetermined size. This works well for temporal event data such as logging where each record stands alone. However an important class of data streams are the log of changes to keyed, mutable data (for example, the changes to a database table).

迄今为止，我们只介绍了简单的日志保留方法（当旧的数据保留时间超过指定时间、日志文件大小达到设置大小后就丢弃）。这样的策略非常适用于处理那些暂存的数据，例如记录每条消息之间相互独立的日志。然而在实际使用过程中还有一种非常重要的场景 -- 根据 key 进行数据变更（例如更改数据库表内容），使用以上的方式显然不行。

Let's discuss a concrete example of such a stream. Say we have a topic containing user email addresses; every time a user updates their email address we send a message to this topic using their user id as the primary key. Now say we send the following messages over some time period for a user with id 123, each message corresponding to a change in email address (messages for other ids are omitted):

让我们来讨论一个关于处理这样流式数据的具体的例子。假设我们有一个 topic，里面的内容包含用户的 email 地址；每次用户更新他们的 email 地址时，我们发送一条消息到这个 topic，这里使用用户 Id 作为消息的 key 值。现在，我们在一段时间内为 id 为 123 的用户发送一些消息，每个消息对应 email 地址的改变（其他 ID 消息省略）:

```
    123 => bill@microsoft.com
            .
            .
            .
    123 => bill@gatesfoundation.org
            .
            .
            .
    123 => bill@gmail.com

```

Log compaction gives us a more granular retention mechanism so that we are guaranteed to retain at least the last update for each primary key (e.g. `bill@gmail.com`). By doing this we guarantee that the log contains a full snapshot of the final value for every key not just keys that changed recently. This means downstream consumers can restore their own state off this topic without us having to retain a complete log of all changes.

日志压缩为我们提供了更精细的保留机制，所以我们至少保留每个 key 的最后一次更新（例如：bill@gmail.com）。这样我们保证日志包含每一个 key 的最终值而不只是最近变更的完整快照。这意味着下游的消费者可以获得最终的状态而无需拿到所有的变化的消息信息。

Let's start by looking at a few use cases where this is useful, then we'll see how it can be used.

让我们先看几个有用的使用场景，然后再看看如何使用它。

1. _Database change subscription_. It is often necessary to have a data set in multiple data systems, and often one of these systems is a database of some kind (either a RDBMS or perhaps a new-fangled key-value store). For example you might have a database, a cache, a search cluster, and a Hadoop cluster. Each change to the database will need to be reflected in the cache, the search cluster, and eventually in Hadoop. In the case that one is only handling the real-time updates you only need recent log. But if you want to be able to reload the cache or restore a failed search node you may need a complete data set.
2. _Event sourcing_. This is a style of application design which co-locates query processing with application design and uses a log of changes as the primary store for the application.
3. _Journaling for high-availability_. A process that does local computation can be made fault-tolerant by logging out changes that it makes to it's local state so another process can reload these changes and carry on if it should fail. A concrete example of this is handling counts, aggregations, and other "group by"-like processing in a stream query system. Samza, a real-time stream-processing framework, **[uses this feature](http://samza.apache.org/learn/documentation/0.7.0/container/state-management.html)** for exactly this purpose.

- _数据库更改订阅_。通常需要在多个数据系统设置拥有一个数据集，这些系统中通常有一个是某种类型的数据库（无论是 RDBMS 或者新流行的 key-value 数据库）。 例如，你可能有一个数据库，缓存，搜索引擎集群或者 Hadoop 集群。每次变更数据库，也同时需要变更缓存、搜索引擎以及 hadoop 集群。 在只需处理最新日志的实时更新的情况下，你只需要最近的日志。但是，如果你希望能够重新加载缓存或恢复搜索失败的节点，你可能需要一个完整的数据集
- _事件源_。 这是一种应用程序设计风格，它将查询处理与应用程序设计相结合，并使用变更的日志作为应用程序的主要存储
- _日志高可用_。 执行本地计算的进程可以通过注销对其本地状态所做的更改来实现容错，以便另一个进程可以重新加载这些更改并在出现故障时继续进行。 一个具体的例子就是在流查询系统中进行计数，聚合和其他类似“group by”的操作。实时流处理框架 Samza，[使用这个特性](http://samza.apache.org/learn/documentation/0.7.0/container/state-management.html) 正是出于这一原因

In each of these cases one needs primarily to handle the real-time feed of changes, but occasionally, when a machine crashes or data needs to be re-loaded or re-processed, one needs to do a full load. Log compaction allows feeding both of these use cases off the same backing topic. This style of usage of a log is described in more detail in **[this blog post](http://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)**.

在这些场景中，主要需要处理变化的实时 feed，但是偶尔当机器崩溃或需要重新加载或重新处理数据时，需要处理所有数据。日志压缩允许在同一 topic 下同时使用这两个用例。这种日志使用方式更详细的描述请看[这篇博客](http://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)。

The general idea is quite simple. If we had infinite log retention, and we logged each change in the above cases, then we would have captured the state of the system at each time from when it first began. Using this complete log, we could restore to any point in time by replaying the first N records in the log. This hypothetical complete log is not very practical for systems that update a single record many times as the log will grow without bound even for a stable dataset. The simple log retention mechanism which throws away old updates will bound space but the log is no longer a way to restore the current state—now restoring from the beginning of the log no longer recreates the current state as old updates may not be captured at all.

想法很简单，我们有无限的日志，以上每种情况记录变更日志，我们从一开始就捕获每一次变更。使用这个完整的日志，我们可以通过回放日志来恢复到任何一个时间点的状态。然而这种假设的情况下，完整的日志是不实际的，对于那些每一行记录会变更多次的系统，即使数据集很小，日志也会无限的增长下去。丢弃旧日志的简单操作可以限制空间的增长，但是无法重建状态——因为旧的日志被丢弃，可能一部分记录的状态会无法重建（这些记录所有的状态变更都在旧日志中）。

Log compaction is a mechanism to give finer-grained per-record retention, rather than the coarser-grained time-based retention. The idea is to selectively remove records where we have a more recent update with the same primary key. This way the log is guaranteed to have at least the last state for each key.

日志压缩机制是更细粒度的、每个记录都保留的机制，而不是基于时间的粗粒度。这个理念是选择性删除那些有更新的变更的记录的日志。这样最终日志至少包含每个 key 的记录的最后一个状态。

This retention policy can be set per-topic, so a single cluster can have some topics where retention is enforced by size or time and other topics where retention is enforced by compaction.

这种保留策略可以针对每一个 topci 进行设置，遮掩一个集群中，可以让部分 topic 通过时间和大小保留日志，另一些可以通过压缩策略保留。

This functionality is inspired by one of LinkedIn's oldest and most successful pieces of infrastructure—a database changelog caching service called **[Databus](https://github.com/linkedin/databus)**. Unlike most log-structured storage systems Kafka is built for subscription and organizes data for fast linear reads and writes. Unlike Databus, Kafka acts as a source-of-truth store so it is useful even in situations where the upstream data source would not otherwise be replayable.

这个功能的灵感来自于 LinkedIn 的最古老且最成功的基础设置 -- 一个称为 [**Databus**](https://github.com/linkedin/databus) 的数据库变更日志缓存系统。不像大多数的日志存储系统，Kafka 是专门为订阅和快速线性的读和写组织数据而设计。和 Databus 不同，Kafka 作为真实的存储，压缩日志是非常有用的，这非常有利于上游数据源不能重放的情况。

#### [日志压缩基础](#design_compactionbasics)<a id="design_compactionbasics"></a>

Here is a high-level picture that shows the logical structure of a Kafka log with the offset for each message.

这是一个高级别的日志逻辑图，展示了 kafka 日志的每条消息的 offset 逻辑结构。

![](/images/log_cleaner_anatomy.png)

The head of the log is identical to a traditional Kafka log. It has dense, sequential offsets and retains all messages. Log compaction adds an option for handling the tail of the log. The picture above shows a log with a compacted tail. Note that the messages in the tail of the log retain the original offset assigned when they were first written—that never changes. Note also that all offsets remain valid positions in the log, even if the message with that offset has been compacted away; in this case this position is indistinguishable from the next highest offset that does appear in the log. For example, in the picture above the offsets 36, 37, and 38 are all equivalent positions and a read beginning at any of these offsets would return a message set beginning with 38.

Log head 中包含传统的 Kafka 日志，它包含了连续的 offset 和所有的消息。日志压缩增加了处理 tail Log 的选项。上图展示了日志压缩的的 Log tail 的情况。tail 中的消息保存了初次写入时的 offset。 即使该 offset 的消息被压缩，所有 offset 仍然在日志中是有效的。在这个场景中，无法区分和下一个出现的更高 offset 的位置。如上面的例子中，36、37、38 是属于相同位置的，从他们开始读取日志都将从 38 开始。

Compaction also allows for deletes. A message with a key and a null payload will be treated as a delete from the log. This delete marker will cause any prior message with that key to be removed (as would any new message with that key), but delete markers are special in that they will themselves be cleaned out of the log after a period of time to free up space. The point in time at which deletes are no longer retained is marked as the "delete retention point" in the above diagram.

压缩也允许删除。通过消息的 key 和空负载（null payload）来标识该消息可从日志中删除。这个删除标记将会引起所有之前拥有相同 key 的消息被移除（包括拥有 key 相同的新消息）。但是删除标记比较特殊，它将在一定周期后被从日志中删除来释放空间。这个时间点被称为“delete retention point”，如上图。

The compaction is done in the background by periodically recopying log segments. Cleaning does not block reads and can be throttled to use no more than a configurable amount of I/O throughput to avoid impacting producers and consumers. The actual process of compacting a log segment looks something like this:

压缩操作通过后台周期性的拷贝日志段来完成。清除操作不会阻塞读取，并且可以被配置不超过一定 IO 吞吐来避免影响 Producer 和 Consumer。实际的日志段压缩过程有点像这样：

![](/images/log_compaction.png)

#### [What guarantees does log compaction provide?](#design_compactionguarantees)<a id="design_compactionguarantees"></a>

Log compaction guarantees the following:
日志压缩的保障措施：

1. Any consumer that stays caught-up to within the head of the log will see every message that is written; these messages will have sequential offsets.
2. Ordering of messages is always maintained. Compaction will never re-order messages, just remove some.
3. The offset for a message never changes. It is the permanent identifier for a position in the log.
4. Any read progressing from offset 0 will see at least the final state of all records in the order they were written. All delete markers for deleted records will be seen provided the reader reaches the head of the log in a time period less than the topic's delete.retention.ms setting (the default is 24 hours). This is important as delete marker removal happens concurrently with read (and thus it is important that we not remove any delete marker prior to the reader seeing it).
5. Any consumer progressing from the start of the log will see at least the _final_ state of all records in the order they were written. All delete markers for deleted records will be seen provided the consumer reaches the head of the log in a time period less than the topic's `delete.retention.ms` setting (the default is 24 hours). This is important as delete marker removal happens concurrently with read, and thus it is important that we do not remove any delete marker prior to the consumer seeing it.

1. 任何滞留在日志 head 中的所有消费者能看到写入的所有消息；这些消息都是有序的 offset。 topic 使用 min.compaction.lag.ms 来保障消息写入之前必须经过的最小时间长度，才能被压缩。 这限制了一条消息在 Log Head 中的最短存在时间。
2. 消息始终保持有序。压缩永远不会重新排序消息，只是删除了一些。
3. 消息的 Offset 永远不会变更。这是消息在日志中的永久标志。
4. 任何从头开始处理日志的 Consumer 至少会拿到每个 key 的_最终_状态。另外，只要 Consumer 在小于 Topic 的 `delete.retention.ms` 设置（默认 24 小时）的时间段内到达 Log head，将会看到所有删除记录的所有删除标记。换句话说，因为移除删除标记和读取是同时发生的，Consumer 可能会因为落后超过 delete.retention.ms 而导致错过删除标记。

#### [Log 压缩细节](#design_compactiondetails)<a id="design_compactiondetails"></a>

Log compaction is handled by the log cleaner, a pool of background threads that recopy log segment files, removing records whose key appears in the head of the log. Each compactor thread works as follows:

日志压缩由 log cleaner 执行，log cleaner 是一个后台线程池，它会 recopy 日志段文件，移除那些 key 存在于 Log Head 中的记录。每个压缩线程工作的步骤如下：

1. It chooses the log that has the highest ratio of log head to log tail
2. It creates a succinct summary of the last offset for each key in the head of the log
3. It recopies the log from beginning to end removing keys which have a later occurrence in the log. New, clean segments are swapped into the log immediately so the additional disk space required is just one additional log segment (not a fully copy of the log).
4. The summary of the log head is essentially just a space-compact hash table. It uses exactly 24 bytes per entry. As a result with 8GB of cleaner buffer one cleaner iteration can clean around 366GB of log head (assuming 1k messages).

1. 选择 log head 与 log tail 比率最高的日志
2. 在 head log 中为每个 key 最后 offset 创建一个简单概要
3. 从日志的开始到结束，删除那些在日志中最新出现的 key 的旧值。新的、干净的日志会被立即提交到日志中，所以只需要一个额外的日志段空间（不是日志的完整副本）
4. 日志 head 的概念本质上是一个空间密集的 hash 表，每个条目使用 24 个字节。所以如果有 8G 的整理缓冲区，则能迭代处理大约 336G 的 log head （假设消息大小为 1k）

#### [配置 Log Cleaner](#design_compactionconfig)<a id="design_compactionconfig"></a>

The log cleaner is disabled by default. To enable it set the server config

log cleaner 默认是关闭的，可以通过以下服务端配置开启：

```
  log.cleaner.enable=true
```

This will start the pool of cleaner threads. To enable log cleaning on a particular topic you can add the log-specific property

这会启动清理线程池。如果要开启特定 topic 的清理功能，需要开启特定的 log-specific 属性

```
  log.cleanup.policy=compact
```

This can be done either at topic creation time or using the alter topic command.

这个可以通过创建 topic 时配置或者之后使用 topic 命令实现。

更多的关于 cleaner 的配置可以从**[这里](http://kafka.apache.org/documentation.html#brokerconfigs)**找到。

#### [Log Compaction Limitations](#design_compactionlimitations)<a id="design_compactionlimitations"></a>

1. You cannot configure yet how much log is retained without compaction (the "head" of the log). Currently all segments are eligible except for the last segment, i.e. the one currently being written to.

### [4.9 配额](#design_quotas)<a id="design_quotas"></a>

Starting in 0.9, the Kafka cluster has the ability to enforce quotas on produce and fetch requests. Quotas are basically byte-rate thresholds defined per client-id. A client-id logically identifies an application making a request. Hence a single client-id can span multiple producer and consumer instances and the quota will apply for all of them as a single entity i.e. if client-id="test-client" has a produce quota of 10MB/sec, this is shared across all instances with that same id.

#### [Why are quotas necessary?](#design_quotasnecessary)<a id="design_quotasnecessary"></a>

It is possible for producers and consumers to produce/consume very high volumes of data and thus monopolize broker resources, cause network saturation and generally DOS other clients and the brokers themselves. Having quotas protects against these issues and is all the more important in large multi-tenant clusters where a small set of badly behaved clients can degrade user experience for the well behaved ones. In fact, when running Kafka as a service this even makes it possible to enforce API limits according to an agreed upon contract.

producers 和 consumer 可能会产生和消费大量的消息从而导致独占 broker 资源，进而引起网络饱和，对其他 client 和 broker 造成 DOS 攻击。资源的配额保护可以有效的防止这些问题，大型的多租户集群中，因为一小部分表现不佳的客户端降低了良好的用户体验，这种情况下非常需要资源的配额保护。实际情况中，当把 Kafka 当做一种服务提供时，可以根据客户端和服务端的契约对 API 调用做限制。

#### [Enforcement](#design_quotasenforcement)<a id="design_quotasenforcement"></a>

By default, each unique client-id receives a fixed quota in bytes/sec as configured by the cluster (quota.producer.default, quota.consumer.default). This quota is defined on a per-broker basis. Each client can publish/fetch a maximum of X bytes/sec per broker before it gets throttled. We decided that defining these quotas per broker is much better than having a fixed cluster wide bandwidth per client because that would require a mechanism to share client quota usage among all the brokers. This can be harder to get right than the quota implementation itself!

默认情况下，每个唯一的客户端分组在集群上配置一个固定的限额，这个限额是基于每台服务器的 (quota.producer.default, quota.consumer.default)，每个客户端能发布或获取每台服务器都的最大速率，我们按服务器 (broker) 定义配置，而不是按整个集群定义，是因为如果是集群范围需要额外的机制来共享配额的使用情况，这会导致配额机制的实现比较难。

How does a broker react when it detects a quota violation? In our solution, the broker does not return an error rather it attempts to slow down a client exceeding its quota. It computes the amount of delay needed to bring a guilty client under it's quota and delays the response for that time. This approach keeps the quota violation transparent to clients (outside of client-side metrics). This also keeps them from having to implement any special backoff and retry behavior which can get tricky. In fact, bad client behavior (retry without backoff) can exacerbate the very problem quotas are trying to solve.

当 broker 检测到超过配额时如何反应？在我们的解决方案中，broker 不会返回错误，相反他会尝试降低超过限额的客户端速度，它计算将超过限额客户端拉回到正常水平的时间，并相应的延迟响应时间。这个方法让超出配额的处理变得透明化。这个方法同样让客户端免于处理棘手的重试和特殊的补救措施。事实上，错误的补救措施可能加重限额这个问题。

Client byte rate is measured over multiple small windows (e.g. 30 windows of 1 second each) in order to detect and correct quota violations quickly. Typically, having large measurement windows (for e.g. 10 windows of 30 seconds each) leads to large bursts of traffic followed by long delays which is not great in terms of user experience.

客户端的字节限速使用多个小时间窗口（每秒 30 个窗口）来快速检测和更正配额越界。如果使用太大的配额窗口（例如 30 秒 10 个窗口），容易导致在较长时间内有巨大的流量突增，这个在实际中用户体验并不好。

#### [Quota overrides](#design_quotasoverrides)<a id="design_quotasoverrides"></a>

It is possible to override the default quota for client-ids that need a higher (or even lower) quota. The mechanism is similar to the per-topic log config overrides. Client-id overrides are written to ZooKeeper under**_/config/clients_**. These overrides are read by all brokers and are effective immediately. This lets us change quotas without having to do a rolling restart of the entire cluster. See **[here](http://kafka.apache.org/documentation.html#quotas)** for details.

覆盖 client-ids 默认的配额是可行的。这个机制类似于每一个 topic 日志的配置覆盖。client-id 覆盖会被写到 ZooKeeper，这个覆盖会被所有的 broker 读取并且迅速加载生效。这样使得我们可以不需要重启集群中的机器而快速的改变配额。点击 [这里](http://kafka.apache.org/documentation.html#quotas) 查看更多的信息。
