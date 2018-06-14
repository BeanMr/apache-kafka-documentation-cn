## [6. 基本操作](#operations)<a id="operations"></a>

Here is some information on actually running Kafka as a production system based on usage and experience at LinkedIn. Please send us any additional tips you know of.

以下是根据 LinkedIn 使用和经验实际运行 Kafka 作为生产系统的一些信息。请向我们发送任何您知道的其他信息。

### [6.1 基础 Kafka 操作](#basic_ops)<a id="basic_ops"></a>

This section will review the most common operations you will perform on your Kafka cluster. All of the tools reviewed in this section are available under the `bin/` directory of the Kafka distribution and each tool will print details on all possible commandline options if it is run with no arguments.

本节将回顾您将在 Kafka 集群上执行的最常见操作。本节中回顾的所有工具都可以在 Kafka 发行版的`bin/`目录下找到，如果没有参数运行，每个工具都会打印所有可能的命令行选项的详细信息。

#### [添加和删除 topics](#basic_ops_add_topic)<a id="basic_ops_add_topic"></a>

You have the option of either adding topics manually or having them be created automatically when data is first published to a non-existent topic. If topics are auto-created then you may want to tune the default [**topic configurations**](http://kafka.apache.org/documentation.html#topic-config) used for auto-created topics.

您可以选择手动添加 topic，或者在数据首次发布到不存在的 topic 时自动创建 topic。如果 topic 是自动创建的，那么您可能需要调整用于自动创建的 topic 的默认 [**topic 配置**](http://kafka.apache.org/documentation.html#topic-config)。

使用 topic 工具添加和修改 topic：

```
 > bin/kafka-topics.sh --zookeeper zk_host:port/chroot --create --topic my_topic_name
       --partitions 20 --replication-factor 3 --config x=y

```

The replication factor controls how many servers will replicate each message that is written. If you have a replication factor of 3 then up to 2 servers can fail before you will lose access to your data. We recommend you use a replication factor of 2 or 3 so that you can transparently bounce machines without interrupting data consumption.

复制因子控制有多少服务器将复制每个写入的消息。如果复制因子为 3，则最多有 2 台服务器可能会失败，然后您将无法访问数据。我们建议您使用 2 或 3 的复制因子，以便在不中断数据消耗的情况下透明地 bounce 机器。

The partition count controls how many logs the topic will be sharded into. There are several impacts of the partition count. First each partition must fit entirely on a single server. So if you have 20 partitions the full data set (and read and write load) will be handled by no more than 20 servers (no counting replicas). Finally the partition count impacts the maximum parallelism of your consumers. This is discussed in greater detail in the[**concepts section**](http://kafka.apache.org/documentation.html#intro_consumers).

分区计数控制 topic 将被分成多少个日志。分区计数有几个影响。首先，每个分区必须完全适合一台服务器。所以如果你有 20 个分区，完整的数据集（以及读写负载）将由不超过 20 个的服务器处理（不包括计数副本）。最后，分区数会影响消费者的最大并行性。这在 [**concepts section**](http://kafka.apache.org/documentation.html#intro_consumers) 中有更详细的讨论。


Each sharded partition log is placed into its own folder under the Kafka log directory. The name of such folders consists of the topic name, appended by a dash (-) and the partition id. Since a typical folder name can not be over 255 characters long, there will be a limitation on the length of topic names. We assume the number of partitions will not ever be above 100,000. Therefore, topic names cannot be longer than 249 characters. This leaves just enough room in the folder name for a dash and a potentially 5 digit long partition id.

每个分片分区日志都放在 Kafka 日志目录下各自的文件夹中。这些文件夹的名称由 topic 名称组成，由短划线（-）和分区 ID 结尾。由于文件夹名称长度不能超过 255 个字符，因此 topic 名称的长度会受到限制。我们假设分区的数量不会超过 100,000。因此，topic 名称不能超过 249 个字符。这在文件夹名称中留下了足够的空间以显示短划线和可能的 5 位长分区 ID。

The configurations added on the command line override the default settings the server has for things like the length of time data should be retained. The complete set of per-topic configurations is documented [**here**](http://kafka.apache.org/documentation.html#topic-config).

在命令行中添加的配置会覆盖服务器的默认设置，例如应该保留数据的时间长度。 [**here**](http://kafka.apache.org/documentation.html#topic-config) 记录了完整的每个 topic 配置。

#### [修改 topics](#basic_ops_modify_topic)<a id="basic_ops_modify_topic"></a>

You can change the configuration or partitioning of a topic using the same topic tool.

您可以使用相同的 topic 工具更改 topic 的配置或分区。

要添加分区，你可以执行如下命令：

```
 > bin/kafka-topics.sh --zookeeper zk_host:port/chroot --alter --topic my_topic_name
       --partitions 40

```

Be aware that one use case for partitions is to semantically partition data, and adding partitions doesn't change the partitioning of existing data so this may disturb consumers if they rely on that partition. That is if data is partitioned by `hash(key) % number_of_partitions` then this partitioning will potentially be shuffled by adding partitions but Kafka will not attempt to automatically redistribute data in any way.

请注意，分区的一种使用场景是对数据进行语义分区，并且添加分区不会更改现有数据的分区，因此如果它们依赖于该分区，则可能会影响消费者。也就是说，如果数据是通过`hash(key)%number_of_partitions` 分区的，那么这个分区可能会通过添加分区进行混洗，但 Kafka 不会尝试以任何方式自动重新分配数据。

To add configs:

要添加配置：


```
 > bin/kafka-topics.sh --zookeeper zk_host:port/chroot --alter --topic my_topic_name --config x=y

```

To remove a config:

要删除配置：

```
 > bin/kafka-topics.sh --zookeeper zk_host:port/chroot --alter --topic my_topic_name --delete-config x

```

And finally deleting a topic:

最后删除一个 topic：

```
 > bin/kafka-topics.sh --zookeeper zk_host:port/chroot --delete --topic my_topic_name

```

Topic deletion option is disabled by default. To enable it set the server config

topic 删除选项在默认情况下被禁用。要启用它，请设置服务器配置：


```
delete.topic.enable=true
```

Kafka does not currently support reducing the number of partitions for a topic.

Kafka 目前不支持减少某个 topic 的分区数量。

Instructions for changing the replication factor of a topic can be found [**here**](http://kafka.apache.org/documentation.html#basic_ops_increase_replication_factor).

有关更改 topic 的复制因子的说明，请参见 [**here**](http://kafka.apache.org/documentation.html#basic_ops_increase_replication_factor) 。


#### [优雅的关机](#basic_ops_restarting)<a id="basic_ops_restarting"></a>

The Kafka cluster will automatically detect any broker shutdown or failure and elect new leaders for the partitions on that machine. This will occur whether a server fails or it is brought down intentionally for maintenance or configuration changes. For the latter cases Kafka supports a more graceful mechanism for stopping a server than just killing it. When a server is stopped gracefully it has two optimizations it will take advantage of:

Kafka 集群将自动检测任何 broker 关闭或故障，并为该机器上的分区选择新的领导者。无论服务器发生故障还是因为维护或配置更改而故意将其关闭，都会发生这种情况。对于后者，Kafka 支持更优雅的停止服务器的机制，而不仅仅是杀死它。当服务器正常停止时，它有两个优化，它将利用：

1. It will sync all its logs to disk to avoid needing to do any log recovery when it restarts (i.e. validating the checksum for all messages in the tail of the log). Log recovery takes time so this speeds up intentional restarts.
2. It will migrate any partitions the server is the leader for to other replicas prior to shutting down. This will make the leadership transfer faster and minimize the time each partition is unavailable to a few milliseconds.

1. 它会将其所有日志同步到磁盘，以避免重新启动时需要执行任何日志恢复（即验证日志尾部中所有消息的校验和）。日志恢复需要时间，所以这会加速有意重启。
2. 它将在关闭之前将服务器领导者的任何分区迁移到其他副本。这将使领导变更更快，并将每个分区不可用的时间缩短到几毫秒。

Syncing the logs will happen automatically whenever the server is stopped other than by a hard kill, but the controlled leadership migration requires using a special setting:

只要服务器停止而不是通过硬性杀死，同步日志就会自动发生，但受控领导变更需要使用特殊设置：

```
    controlled.shutdown.enable=true

```

Note that controlled shutdown will only succeed if _all_ the partitions hosted on the broker have replicas (i.e. the replication factor is greater than 1 _and_ at least one of these replicas is alive). This is generally what you want since shutting down the last replica would make that topic partition unavailable.

请注意，如果托管在 broker 上的分区具有副本（即，复制因子大于 1，并且这些副本中至少有一个活着），则受控关闭只能成功。这通常是您想要的，因为关闭最后一个副本会使该 topic 分区不可用。

#### [Balancing leadership](#basic_ops_leader_balancing)<a id="basic_ops_leader_balancing"></a>

Whenever a broker stops or crashes leadership for that broker's partitions transfers to other replicas. This means that by default when the broker is restarted it will only be a follower for all its partitions, meaning it will not be used for client reads and writes.

每当 broker 停止或崩溃对该 broker 的分区转移到其他副本的领导。这意味着，在 broker 重新启动时，默认情况下它将只是所有分区的跟随者，这意味着它不会用于客户端读取和写入。

To avoid this imbalance, Kafka has a notion of preferred replicas. If the list of replicas for a partition is 1,5,9 then node 1 is preferred as the leader to either node 5 or 9 because it is earlier in the replica list. You can have the Kafka cluster try to restore leadership to the restored replicas by running the command:

为了避免这种不平衡，Kafka 有一个首选复制品的概念。如果分区的副本列表为 1,5,9，则节点 1 首选为节点 5 或 9 的组长，因为它在副本列表中较早。您可以通过运行以下命令让 Kafka 集群尝试恢复已恢复副本的领导地位：

```
 > bin/kafka-preferred-replica-election.sh --zookeeper zk_host:port/chroot

```

Since running this command can be tedious you can also configure Kafka to do this automatically by setting the following configuration:

由于运行此命令可能很乏味，因此您可以通过设置以下配置来自动配置 Kafka 自动执行此操作：

```
    auto.leader.rebalance.enable=true

```

#### [Balancing Replicas Across Racks](#basic_ops_racks)<a id="basic_ops_racks"></a>

The rack awareness feature spreads replicas of the same partition across different racks. This extends the guarantees Kafka provides for broker-failure to cover rack-failure, limiting the risk of data loss should all the brokers on a rack fail at once. The feature can also be applied to other broker groupings such as availability zones in EC2.

rack awareness 功能可将同一分区的复制副本分散到不同的 rack 上。这扩展了 Kafka 为 broker 故障提供的担保，以弥补 rack 故障，从而限制 rack 上所有 broker 一次失败时数据丢失的风险。该功能也可以应用于其他 broker 分组，如 EC2 中的可用区域。

You can specify that a broker belongs to a particular rack by adding a property to the broker config:

您可以通过向 broker 配置添加属性来指定 broker 属于特定 rack：


```
   broker.rack=my-rack-id
```

When a topic is [**created**](http://kafka.apache.org/documentation.html#basic_ops_add_topic), [**modified**](http://kafka.apache.org/documentation.html#basic_ops_modify_topic) or replicas are [**redistributed**](http://kafka.apache.org/documentation.html#basic_ops_cluster_expansion), the rack constraint will be honoured, ensuring replicas span as many racks as they can \(a partition will span min\(\#racks, replication-factor\) different racks\).

当一个 topic 是 [**created**](http://kafka.apache.org/documentation.html#basic_ops_add_topic)，[**modified**](http://kafka.apache.org/documentation.html#basic_ops_modify_topic) 或复本是 [**redistributed**](http://kafka.apache.org/documentation.html#basic_ops_cluster_expansion)，rack 约束将被确认，确保副本跨越尽可能多的 rack，因为他们可以（a 分区将跨越最低（＃rack，复制因子）不同的 rack）。


The algorithm used to assign replicas to brokers ensures that the number of leaders per broker will be constant, regardless of how brokers are distributed across racks. This ensures balanced throughput.

用于向 broker 分配副本的算法确保每个 broker 的领导者数量将保持不变，而不管 broker 如何在 rack 中分布。这确保了平衡的吞吐量

However if racks are assigned different numbers of brokers, the assignment of replicas will not be even. Racks with fewer brokers will get more replicas, meaning they will use more storage and put more resources into replication. Hence it is sensible to configure an equal number of brokers per rack.

但是，如果 rack 分配有不同数量的 broker，则副本的分配将不均匀。broker 数量较少的 rack 将获得更多副本，这意味着他们将使用更多存储并将更多资源投入复制。因此，每个 rack 配置相同数量的 broker 是明智的。

#### [集群之前镜像数据](#basic_ops_mirror_maker)<a id="basic_ops_mirror_maker"></a>

We refer to the process of replicating data _between_ Kafka clusters "mirroring" to avoid confusion with the replication that happens amongst the nodes in a single cluster. Kafka comes with a tool for mirroring data between Kafka clusters. The tool reads from a source cluster and writes to a destination cluster, like this:

我们指的是在“镜像”之间复制卡夫卡群集之间的数据的过程，以避免与单个群集中的节点之间发生的复制混淆。 Kafka 附带了一个在 Kafka 集群之间镜像数据的工具。该工具从源集群读取并写入目标集群，如下所示：

![](/images/mirror-maker.png)

A common use case for this kind of mirroring is to provide a replica in another datacenter. This scenario will be discussed in more detail in the next section.

这种镜像的常见用例是在另一个数据中心提供副本。这种情况将在下一节中详细讨论。

You can run many such mirroring processes to increase throughput and for fault-tolerance (if one process dies, the others will take overs the additional load).

您可以运行许多这样的镜像过程来提高吞吐量和容错能力（如果一个进程死了，其他进程将占用额外的负载）。

Data will be read from topics in the source cluster and written to a topic with the same name in the destination cluster. In fact the mirror maker is little more than a Kafka consumer and producer hooked together.

将从源群集中的 topic 读取数据并将其写入目标群集中具有相同名称的 topic。事实上，镜像 maker 只不过是一个 Kafka 消费者和生产者联合在一起。

The source and destination clusters are completely independent entities: they can have different numbers of partitions and the offsets will not be the same. For this reason the mirror cluster is not really intended as a fault-tolerance mechanism (as the consumer position will be different); for that we recommend using normal in-cluster replication. The mirror maker process will, however, retain and use the message key for partitioning so order is preserved on a per-key basis.

源和目标集群是完全独立的实体：它们可以具有不同数量的分区，并且偏移量不会相同。出于这个原因，镜像集群并不是真正意图作为容错机制（因为消费者的位置会不同）。为此，我们建议使用正常的群集内复制。但镜像 maker 进程将保留并使用消息密钥进行分区，以便按每个密钥保留顺序。

Here is an example showing how to mirror a single topic (named _my-topic_) from two input clusters:

以下示例显示如何从两个输入群集镜像单个 topic（名为 _my-topic_ ）：

```
 > bin/kafka-mirror-maker.sh
       --consumer.config consumer-1.properties --consumer.config consumer-2.properties
       --producer.config producer.properties --whitelist my-topic

```

Note that we specify the list of topics with the `--whitelist` option. This option allows any regular expression using [**Java-style regular expressions**](http://docs.oracle.com/javase/7/docs/api/java/util/regex/Pattern.html). So you could mirror two topics named _A_ and _B_ using `--whitelist 'A|B'`. Or you could mirror _all_ topics using `--whitelist '*'`. Make sure to quote any regular expression to ensure the shell doesn't try to expand it as a file path. For convenience we allow the use of ',' instead of '\|' to specify a list of topics.

请注意，我们使用`--whitelist`选项指定 topic 列表。此选项允许使用 [**Java 风格的正则表达式**](http://docs.oracle.com/javase/7/docs/api/java/util/regex/Pattern.html) 的任何正则表达式。因此，您可以使用`--whitelist'A | B'`来镜像名为 _A_ 和 _B_ 的两个 topic。或者你可以使用`--whitelist '*'`来镜像 _all_ topic。确保引用任何正则表达式以确保 shell 不会尝试将其展开为文件路径。为了方便起见，我们允许使用','而不是'|'指定 topic 列表。

Sometimes it is easier to say what it is that you _don't_ want. Instead of using `--whitelist` to say what you want to mirror you can use `--blacklist` to say what to exclude. This also takes a regular expression argument. However, `--blacklist` is not supported when using `--new.consumer`.

有时候更容易说出你不想要的东西。您可以使用`--blacklist` 来表示要排除的内容，而不是使用`--whitelist`来表示要镜像的内容。这也需要一个正则表达式参数。但是，使用`--new.consumer`时不支持`--blacklist`。

Combining mirroring with the configuration `auto.create.topics.enable=true` makes it possible to have a replica cluster that will automatically create and replicate all data in a source cluster even as new topics are added.

将镜像与`auto.create.topics.enable = true`配置结合使用，可以创建一个副本群集，即使在添加新 topic 时，该群集也会自动创建并复制源群集中的所有数据。

#### [检查 consumer 位置](#basic_ops_consumer_lag)<a id="basic_ops_consumer_lag"></a>

Sometimes it's useful to see the position of your consumers. We have a tool that will show the position of all consumers in a consumer group as well as how far behind the end of the log they are. To run this tool on a consumer group named _my-group_ consuming a topic named _my-topic_ would look like this:

有时看到消费者的位置很有用。有一个工具可以显示消费者群体中所有消费者的位置以及他们所在日志的结尾。要在名为 _my-group_ 的使用者组上运行此工具，消费名为 _my-topic_ 的 topic 如下所示：

```
 > bin/kafka-run-class.sh kafka.tools.ConsumerOffsetChecker --zookeeper localhost:2181 --group test
Group           Topic                          Pid Offset          logSize         Lag             Owner
my-group        my-topic                       0   0               0               0               test_jkreps-mn-1394154511599-60744496-0
my-group        my-topic                       1   0               0               0               test_jkreps-mn-1394154521217-1a0be913-0
```

Note, however, after 0.9.0, the kafka.tools.ConsumerOffsetChecker tool is deprecated and you should use the kafka.admin.ConsumerGroupCommand (or the bin/kafka-consumer-groups.sh script) to manage consumer groups, including consumers created with the [**new consumer API**](http://kafka.apache.org/documentation.html#newconsumerapi).

但是请注意，在 0.9.0 之后，`kafka.tools.ConsumerOffsetChecker` 工具已弃用，您应该使用 `kafka.admin.ConsumerGroupCommand`（或 `bin/kafka-consumer-groups.sh` 脚本）来管理消费者组，包括创建的消费者与 [**新消费者 API**](http://kafka.apache.org/documentation.html#newconsumerapi)。


#### [管理 consumer 组](#basic_ops_consumer_group)<a id="basic_ops_consumer_group"></a>

With the ConsumerGroupCommand tool, we can list, delete, or describe consumer groups. For example, to list all consumer groups across all topics:

通过 ConsumerGroupCommand 工具，我们可以列出，删除或描述消费者组。例如，要列出所有 topic 中的所有消费者组：

```
 > bin/kafka-consumer-groups.sh --zookeeper localhost:2181 --list

test-consumer-group
```

To view offsets as in the previous example with the ConsumerOffsetChecker, we "describe" the consumer group like this:

要像使用 ConsumerOffsetChecker 那样查看偏移量，我们可以像这样“describe”消费者组：

```
 > bin/kafka-consumer-groups.sh --zookeeper localhost:2181 --describe --group test-consumer-group

GROUP                          TOPIC                          PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG             OWNER
test-consumer-group            test-foo                       0          1               3               2               test-consumer-group_postamac.local-1456198719410-29ccd54f-0
```

When you're using the [**new consumer API**](http://kafka.apache.org/documentation.html#newconsumerapi) where the broker handles coordination of partition handling and rebalance, you can manage the groups with the "--new-consumer" flags:

当您使用 broker 处理分区处理和重新平衡协调的 [**new consumer API**](http://kafka.apache.org/documentation.html#newconsumerapi) 时，您可以使用“--new-consumer”标志：

```
 > bin/kafka-consumer-groups.sh --new-consumer --bootstrap-server broker1:9092 --list

```

#### [扩展集群](#basic_ops_cluster_expansion)<a id="basic_ops_cluster_expansion"></a>

Adding servers to a Kafka cluster is easy, just assign them a unique broker id and start up Kafka on your new servers. However these new servers will not automatically be assigned any data partitions, so unless partitions are moved to them they won't be doing any work until new topics are created. So usually when you add machines to your cluster you will want to migrate some existing data to these machines.

将服务器添加到 Kafka 集群非常简单，只需为其分配唯一的 broker ID 并在新服务器上启动 Kafka 即可。但是，这些新服务器不会自动分配任何数据分区，因此除非将分区移动到其中，否则在创建新 topic 之前它们将不会执行任何工作。所以通常当您将机器添加到群集中时，您会希望将一些现有数据迁移到这些机器上。

The process of migrating data is manually initiated but fully automated. Under the covers what happens is that Kafka will add the new server as a follower of the partition it is migrating and allow it to fully replicate the existing data in that partition. When the new server has fully replicated the contents of this partition and joined the in-sync replica one of the existing replicas will delete their partition's data.

迁移数据的过程是手动启动的，但是完全自动化。在封面之下发生的是，Kafka 会将新服务器添加为正在迁移的分区的跟随者，并允许它完全复制该分区中的现有数据。当新服务器完全复制了此分区的内容并加入了同步副本时，其中一个现有副本将删除其分区的数据。

The partition reassignment tool can be used to move partitions across brokers. An ideal partition distribution would ensure even data load and partition sizes across all brokers. The partition reassignment tool does not have the capability to automatically study the data distribution in a Kafka cluster and move partitions around to attain an even load distribution. As such, the admin has to figure out which topics or partitions should be moved around.

分区重新分配工具可用于跨 broker 移动分区。理想的分区分布将确保所有 broker 的数据加载和分区大小。分区重新分配工具没有能力自动研究 Kafka 集群中的数据分布，并且可以移动分区以获得均匀的负载分布。因此，管理员必须找出哪些 topic 或分区应该移动。

The partition reassignment tool can run in 3 mutually exclusive modes -

分区重新分配工具可以以 3 种互斥模式运行 -

* --generate: In this mode, given a list of topics and a list of brokers, the tool generates a candidate reassignment to move all partitions of the specified topics to the new brokers. This option merely provides a convenient way to generate a partition reassignment plan given a list of topics and target brokers.
* --execute: In this mode, the tool kicks off the reassignment of partitions based on the user provided reassignment plan. (using the --reassignment-json-file option). This can either be a custom reassignment plan hand crafted by the admin or provided by using the --generate option
* --verify: In this mode, the tool verifies the status of the reassignment for all partitions listed during the last --execute. The status can be either of successfully completed, failed or in progress

* --generate：在此模式下，给定 topic 列表和 broker 列表，该工具会生成候选重新分配以将指定 topic 的所有分区移至新 broker。此选项仅提供了一种便捷方式，可以根据 topic 和目标 broker 列表生成分区重新分配计划。
* --execute：在此模式下，该工具根据用户提供的重新分配计划启动分区重新分配。 （使用 --reassignment-json-file 选项）。这可以是由管理员制作的自定义重新分配计划，也可以是使用 --generate 选项提供的自定义重新分配计划
* --verify：在此模式下，该工具验证上次执行期间列出的所有分区的重新分配状态。状态可以是成功完成，失败或正在进行


##### [自动将数据迁移到新机器](#basic_ops_automigrate)<a id="basic_ops_automigrate"></a>

The partition reassignment tool can be used to move some topics off of the current set of brokers to the newly added brokers. This is typically useful while expanding an existing cluster since it is easier to move entire topics to the new set of brokers, than moving one partition at a time. When used to do this, the user should provide a list of topics that should be moved to the new set of brokers and a target list of new brokers. The tool then evenly distributes all partitions for the given list of topics across the new set of brokers. During this move, the replication factor of the topic is kept constant. Effectively the replicas for all partitions for the input list of topics are moved from the old set of brokers to the newly added brokers.

分区重新分配工具可用于将当前一组 broker 的一些 topic 移至新增的 broker。这在扩展现有群集时通常很有用，因为将整个 topic 移动到新 broker 集比移动一个分区更容易。用于这样做时，用户应该提供应该移动到新的 broker 集合和新 broker 目标列表的 topic 列表。该工具然后均匀分配给新 broker 集中的给定 topic 列表的所有分区。在此过程中，该 topic 的复制因子保持不变。实际上，输入 topic 列表的所有分区的副本都从旧的 broker 集合移动到新添加的 broker。


For instance, the following example will move all partitions for topics foo1,foo2 to the new set of brokers 5,6. At the end of this move, all partitions for topics foo1 and foo2 will _only_ exist on brokers 5,6.

例如，以下示例将把 topic foo1，foo2 的所有分区移至新的 broker 集 5,6。在此移动结束时，topic foo1 和 foo2 的所有分区将 _仅_ 存在于 broker5,6 上。

Since the tool accepts the input list of topics as a json file, you first need to identify the topics you want to move and create the json file as follows:

由于该工具接受 topic 的输入列表作为 json 文件，因此首先需要确定要移动的 topic 并创建 json 文件，如下所示：


```
> cat topics-to-move.json
{"topics": [{"topic": "foo1"},
            {"topic": "foo2"}],
 "version":1
}

```

Once the json file is ready, use the partition reassignment tool to generate a candidate assignment:

一旦 json 文件准备就绪，请使用分区重新分配工具来生成候选分配：

```
> bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --topics-to-move-json-file topics-to-move.json --broker-list "5,6" --generate
Current partition replica assignment

{"version":1,
 "partitions":[{"topic":"foo1","partition":2,"replicas":[1,2]},
               {"topic":"foo1","partition":0,"replicas":[3,4]},
               {"topic":"foo2","partition":2,"replicas":[1,2]},
               {"topic":"foo2","partition":0,"replicas":[3,4]},
               {"topic":"foo1","partition":1,"replicas":[2,3]},
               {"topic":"foo2","partition":1,"replicas":[2,3]}]
}

Proposed partition reassignment configuration

{"version":1,
 "partitions":[{"topic":"foo1","partition":2,"replicas":[5,6]},
               {"topic":"foo1","partition":0,"replicas":[5,6]},
               {"topic":"foo2","partition":2,"replicas":[5,6]},
               {"topic":"foo2","partition":0,"replicas":[5,6]},
               {"topic":"foo1","partition":1,"replicas":[5,6]},
               {"topic":"foo2","partition":1,"replicas":[5,6]}]
}

```

The tool generates a candidate assignment that will move all partitions from topics foo1,foo2 to brokers 5,6. Note, however, that at this point, the partition movement has not started, it merely tells you the current assignment and the proposed new assignment. The current assignment should be saved in case you want to rollback to it. The new assignment should be saved in a json file (e.g. expand-cluster-reassignment.json) to be input to the tool with the --execute option as follows:

该工具会生成一个候选分配，将所有分区从 topic foo1，foo2 移动到 broker 5,6。但是，请注意，此时分区移动尚未开始，它只会告诉您当前分配和建议的新分配。当您想要回滚到当前分配时，应保存该分配。新的任务应该保存在一个 json 文件（例如 expand-cluster-reassignment.json ）中，并使用 --execute 选项输入到工具中，如下所示：

```
> bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file expand-cluster-reassignment.json --execute
Current partition replica assignment

{"version":1,
 "partitions":[{"topic":"foo1","partition":2,"replicas":[1,2]},
               {"topic":"foo1","partition":0,"replicas":[3,4]},
               {"topic":"foo2","partition":2,"replicas":[1,2]},
               {"topic":"foo2","partition":0,"replicas":[3,4]},
               {"topic":"foo1","partition":1,"replicas":[2,3]},
               {"topic":"foo2","partition":1,"replicas":[2,3]}]
}

Save this to use as the --reassignment-json-file option during rollback
Successfully started reassignment of partitions
{"version":1,
 "partitions":[{"topic":"foo1","partition":2,"replicas":[5,6]},
               {"topic":"foo1","partition":0,"replicas":[5,6]},
               {"topic":"foo2","partition":2,"replicas":[5,6]},
               {"topic":"foo2","partition":0,"replicas":[5,6]},
               {"topic":"foo1","partition":1,"replicas":[5,6]},
               {"topic":"foo2","partition":1,"replicas":[5,6]}]
}

```

Finally, the --verify option can be used with the tool to check the status of the partition reassignment. Note that the same expand-cluster-reassignment.json \(used with the --execute option\) should be used with the --verify option:

最后，可以使用`--verify`选项和工具来检查分区重新分配的状态。请注意，与`--verify`选项一起使用相同的 expand-cluster-reassignment.json（与 --execute 选项一起使用）：


```
> bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file expand-cluster-reassignment.json --verify
Status of partition reassignment:
Reassignment of partition [foo1,0] completed successfully
Reassignment of partition [foo1,1] is in progress
Reassignment of partition [foo1,2] is in progress
Reassignment of partition [foo2,0] completed successfully
Reassignment of partition [foo2,1] completed successfully
Reassignment of partition [foo2,2] completed successfully

```

##### [自定义分区分配和迁移](#basic_ops_partitionassignment)<a id="basic_ops_partitionassignment"></a>

The partition reassignment tool can also be used to selectively move replicas of a partition to a specific set of brokers. When used in this manner, it is assumed that the user knows the reassignment plan and does not require the tool to generate a candidate reassignment, effectively skipping the --generate step and moving straight to the --execute step

分区重新分配工具也可用于选择性地将分区的副本移动到特定的一组 broker。当以这种方式使用时，假定用户知道重新分配计划并且不需要工具产生候选重新分配，有效地跳过 - 生成步骤并直接移动到 - 执行步骤

For instance, the following example moves partition 0 of topic foo1 to brokers 5,6 and partition 1 of topic foo2 to brokers 2,3:

例如，以下示例将 topic foo1 的分区 0 移动到 broker 5,6 并将 topic foo2 的分区 1 移动到 broker 2,3：

The first step is to hand craft the custom reassignment plan in a json file:

第一步是在 json 文件中手工制作自定义重新分配计划：


```
> cat custom-reassignment.json
{"version":1,"partitions":[{"topic":"foo1","partition":0,"replicas":[5,6]},{"topic":"foo2","partition":1,"replicas":[2,3]}]}

```

Then, use the json file with the --execute option to start the reassignment process:

然后，使用带有 --execute 选项的 json 文件来启动重新分配过程：

```
> bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file custom-reassignment.json --execute
Current partition replica assignment

{"version":1,
 "partitions":[{"topic":"foo1","partition":0,"replicas":[1,2]},
               {"topic":"foo2","partition":1,"replicas":[3,4]}]
}

Save this to use as the --reassignment-json-file option during rollback
Successfully started reassignment of partitions
{"version":1,
 "partitions":[{"topic":"foo1","partition":0,"replicas":[5,6]},
               {"topic":"foo2","partition":1,"replicas":[2,3]}]
}

```

The --verify option can be used with the tool to check the status of the partition reassignment. Note that the same expand-cluster-reassignment.json (used with the --execute option) should be used with the --verify option:

`--verify` 选项可与该工具一起使用，以检查分区重新分配的状态。请注意，与 `--verify` 选项一起使用相同的 expand-cluster-reassignment.json（与 --execute 选项一起使用）：

```
bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file custom-reassignment.json --verify
Status of partition reassignment:
Reassignment of partition [foo1,0] completed successfully
Reassignment of partition [foo2,1] completed successfully
```

#### [下线 brokers](#basic_ops_decommissioning_brokers)<a id="basic_ops_decommissioning_brokers"></a>

The partition reassignment tool does not have the ability to automatically generate a reassignment plan for decommissioning brokers yet. As such, the admin has to come up with a reassignment plan to move the replica for all partitions hosted on the broker to be decommissioned, to the rest of the brokers. This can be relatively tedious as the reassignment needs to ensure that all the replicas are not moved from the decommissioned broker to only one other broker. To make this process effortless, we plan to add tooling support for decommissioning brokers in the future.

分区重新分配工具不具备为退役 broker 自动生成重新分配计划的功能。因此，管理员必须制定重新分配计划，将 broker 上托管的所有分区的副本移至其他 broker。这可能比较单调，因为重新分配需要确保所有副本不会从退役 broker 转移到另一个 broker。为了使这一过程毫不费力，我们计划在未来为退役 broker 添加工具支持。


#### [增加复制因子](#basic_ops_increase_replication_factor)<a id="basic_ops_increase_replication_factor"></a>

Increasing the replication factor of an existing partition is easy. Just specify the extra replicas in the custom reassignment json file and use it with the --execute option to increase the replication factor of the specified partitions.

增加现有分区的复制因子很容易。只需在自定义重新分配 json 文件中指定额外副本，并将其与 `--execute` 选项一起使用即可增加指定分区的复制因子。

For instance, the following example increases the replication factor of partition 0 of topic foo from 1 to 3. Before increasing the replication factor, the partition's only replica existed on broker 5. As part of increasing the replication factor, we will add more replicas on brokers 6 and 7.

例如，以下示例将 topic foo 的分区 0 的复制因子从 1 增加到 3. 在增加复制因子之前，该分区的唯一副本存在于代理 5 上。作为增加复制因子的一部分，我们将添加更多副本 broker 6 和 7。

The first step is to hand craft the custom reassignment plan in a json file:

第一步是在 json 文件中手工制作自定义重新分配计划：

```
> cat increase-replication-factor.json
{"version":1,
 "partitions":[{"topic":"foo","partition":0,"replicas":[5,6,7]}]}

```

Then, use the json file with the --execute option to start the reassignment process:

然后，使用带有 --execute 选项的 json 文件来启动重新分配过程：


```
> bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file increase-replication-factor.json --execute
Current partition replica assignment

{"version":1,
 "partitions":[{"topic":"foo","partition":0,"replicas":[5]}]}

Save this to use as the --reassignment-json-file option during rollback
Successfully started reassignment of partitions
{"version":1,
 "partitions":[{"topic":"foo","partition":0,"replicas":[5,6,7]}]}

```

The --verify option can be used with the tool to check the status of the partition reassignment. Note that the same increase-replication-factor.json \(used with the --execute option\) should be used with the --verify option:

--verify 选项可与该工具一起使用，以检查分区重新分配的状态。请注意，与 --verify 选项一起使用相同的 increase-replication-factor.json（与 --execute 选项一起使用）：


```
bin/kafka-reassign-partitions.sh --zookeeper localhost:2181 --reassignment-json-file increase-replication-factor.json --verify
Status of partition reassignment:
Reassignment of partition [foo,0] completed successfully

```

You can also verify the increase in replication factor with the kafka-topics tool:

```
> bin/kafka-topics.sh --zookeeper localhost:2181 --topic foo --describe
Topic:foo	PartitionCount:1	ReplicationFactor:3	Configs:
	Topic: foo	Partition: 0	Leader: 5	Replicas: 5,6,7	Isr: 5,6,7

```

#### [设置配额](#quotas)<a id="quotas"></a>

It is possible to set default quotas that apply to all client-ids by setting these configs on the brokers. By default, each client-id receives an unlimited quota. The following sets the default quota per producer and consumer client-id to 10MB/sec.

通过在代理上设置这些配置，可以设置适用于所有客户端 ID 的默认配额。默认情况下，每个客户端 ID 都会收到一个无限制的配额。以下设置每个生产者和消费者客户端的默认配额为 10MB / 秒。

```
  quota.producer.default=10485760
  quota.consumer.default=10485760

```

It is also possible to set custom quotas for each client.

也可以为每个客户端设置自定义配额。


```
> bin/kafka-configs.sh  --zookeeper localhost:2181 --alter --add-config 'producer_byte_rate=1024,consumer_byte_rate=2048' --entity-name clientA --entity-type clients
Updated config for clientId: "clientA".

```

Here's how to describe the quota for a given client.

以下是如何描述给定客户的配额。

```
> ./kafka-configs.sh  --zookeeper localhost:2181 --describe --entity-name clientA --entity-type clients
Configs for clients:clientA are producer_byte_rate=1024,consumer_byte_rate=2048

```

### [6.2 数据中心](#datacenters)<a id="datacenters"></a>

Some deployments will need to manage a data pipeline that spans multiple datacenters. Our recommended approach to this is to deploy a local Kafka cluster in each datacenter with application instances in each datacenter interacting only with their local cluster and mirroring between clusters (see the documentation on the [**mirror maker tool**](http://kafka.apache.org/documentation.html#basic_ops_mirror_maker) for how to do this).

某些部署需要管理跨越多个数据中心的数据管道。我们推荐的方法是在每个数据中心部署一个本地 Kafka 集群，每个数据中心的应用程序实例只与本地集群交互，并在集群之间进行镜像（请参阅 [**镜像制作工具**](http://kafka.apache.org/documentation.html#basic_ops_mirror_maker) 如何做到这一点）。


This deployment pattern allows datacenters to act as independent entities and allows us to manage and tune inter-datacenter replication centrally. This allows each facility to stand alone and operate even if the inter-datacenter links are unavailable: when this occurs the mirroring falls behind until the link is restored at which time it catches up.

这种部署模式允许数据中心充当独立实体，并允许我们集中管理和调整数据中心之间的复制。这样，即使数据中心间链路不可用，每个设施也可以独立运行并运行：当发生这种情况时，镜像会落后，直到链路恢复正常时为止。

For applications that need a global view of all data you can use mirroring to provide clusters which have aggregate data mirrored from the local clusters in _all_ datacenters. These aggregate clusters are used for reads by applications that require the full data set.

对于需要所有数据的全局视图的应用程序，可以使用镜像来提供具有从 _all_ 数据中心中的本地群集镜像的聚合数据的群集。这些聚合群集用于需要完整数据集的应用程序的读取。

This is not the only possible deployment pattern. It is possible to read from or write to a remote Kafka cluster over the WAN, though obviously this will add whatever latency is required to get the cluster.

这不是唯一可能的部署模式。通过广域网读取或写入远程 Kafka 集群是可能的，但显然这将增加获取集群所需的任何延迟。

Kafka naturally batches data in both the producer and consumer so it can achieve high-throughput even over a high-latency connection. To allow this though it may be necessary to increase the TCP socket buffer sizes for the producer, consumer, and broker using the `socket.send.buffer.bytes` and`socket.receive.buffer.bytes` configurations. The appropriate way to set this is documented [**here**](http://en.wikipedia.org/wiki/Bandwidth-delay_product).

Kafka 自然地在生产者和消费者中批量处理数据，因此即使通过高延迟连接也可以实现高吞吐量。虽然可能需要使用`socket.send.buffer.bytes`和`socket.receive.buffer.bytes`配置来增加生产者，消费者和代理的 TCP 套接字缓冲区大小。记录 [**here**](http://en.wikipedia.org/wiki/Bandwidth-delay_product) 的适当设置方法。


It is generally _not_ advisable to run a _single_ Kafka cluster that spans multiple datacenters over a high-latency link. This will incur very high replication latency both for Kafka writes and ZooKeeper writes, and neither Kafka nor ZooKeeper will remain available in all locations if the network between locations is unavailable.

通常不建议运行通过高延迟链路跨越多个数据中心的 _single_ Kafka 集群。这将对 Kafka 写入和 ZooKeeper 写入产生非常高的复制延迟，并且如果位置之间的网络不可用，Kafka 和 ZooKeeper 都不会在所有位置都可用。

### [6.3 Kafka Configuration](#config)<a id="config"></a>

#### [Important Client Configurations](#clientconfig)<a id="clientconfig"></a>

The most important producer configurations control

最重要的生产者配置控制

* compression
* sync vs async production
* batch size (for async producers)

* 压缩
* 同步与异步生产
* 批量大小（对于异步 producers）


The most important consumer configuration is the fetch size.

最重要的消费者配置是抓取大小。

All configurations are documented in the [**configuration**](http://kafka.apache.org/documentation.html#configuration) section.

所有配置都记录在 [**configuration**](http://kafka.apache.org/documentation.html#configuration) 部分。

#### [生产服务器配置](#prodconfig)<a id="prodconfig"></a>

Here is our production server configuration:

这是我们的生产服务器配置：


```
# Replication configurations
num.replica.fetchers=4
replica.fetch.max.bytes=1048576
replica.fetch.wait.max.ms=500
replica.high.watermark.checkpoint.interval.ms=5000
replica.socket.timeout.ms=30000
replica.socket.receive.buffer.bytes=65536
replica.lag.time.max.ms=10000

controller.socket.timeout.ms=30000
controller.message.queue.size=10

# Log configuration
num.partitions=8
message.max.bytes=1000000
auto.create.topics.enable=true
log.index.interval.bytes=4096
log.index.size.max.bytes=10485760
log.retention.hours=168
log.flush.interval.ms=10000
log.flush.interval.messages=20000
log.flush.scheduler.interval.ms=2000
log.roll.hours=168
log.retention.check.interval.ms=300000
log.segment.bytes=1073741824

# ZK configuration
zookeeper.connection.timeout.ms=6000
zookeeper.sync.time.ms=2000

# Socket server configuration
num.io.threads=8
num.network.threads=8
socket.request.max.bytes=104857600
socket.receive.buffer.bytes=1048576
socket.send.buffer.bytes=1048576
queued.max.requests=16
fetch.purgatory.purge.interval.requests=100
producer.purgatory.purge.interval.requests=100

```

Our client configuration varies a fair amount between different use cases.

我们的客户配置在不同用例之间变化很大。

### [Java Version](#java)<a id="java"></a>

From a security perspective, we recommend you use the latest released version of JDK 1.8 as older freely available versions have disclosed security vulnerabilities. LinkedIn is currently running JDK 1.8 u5 (looking to upgrade to a newer version) with the G1 collector. If you decide to use the G1 collector (the current default) and you are still on JDK 1.7, make sure you are on u51 or newer. LinkedIn tried out u21 in testing, but they had a number of problems with the GC implementation in that version. LinkedIn's tuning looks like this:

从安全角度来看，我们建议您使用 JDK 1.8 的最新发布版本，因为较早的免费版本已经披露了安全漏洞。 LinkedIn 目前正在使用 G1 收集器运行 JDK 1.8 u5 （希望升级到更新的版本）。如果您决定使用 G1 收集器、（当前默认值、），并且您仍然使用 JDK 1.7，请确保您使用的是 u51 或更新版本。 LinkedIn 在测试中试用了 u21，但是在该版本中，GC 实现方面存在一些问题。 LinkedIn 的调整看起来像这样：

```
-Xmx6g -Xms6g -XX:MetaspaceSize=96m -XX:+UseG1GC
-XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=35 -XX:G1HeapRegionSize=16M
-XX:MinMetaspaceFreeRatio=50 -XX:MaxMetaspaceFreeRatio=80

```

For reference, here are the stats on one of LinkedIn's busiest clusters (at peak):

作为参考，这里是 LinkedIn 最繁忙的群集（峰值）之一的统计数据：


* 60 brokers
* 50k partitions \(replication factor 2\)
* 800k messages\/sec in
* 300 MB\/sec inbound, 1 GB\/sec+ outbound

The tuning looks fairly aggressive, but all of the brokers in that cluster have a 90% GC pause time of about 21ms, and they're doing less than 1 young GC per second.

调整看起来相当积极，但该集群中的所有 broker 都有大约 21ms 的 GC 暂停时间的 90％，而且他们每秒钟的年轻 GC 不到 1 次。

### [6.4 Hardware and OS](#hwandos)<a id="hwandos"></a>

We are using dual quad-core Intel Xeon machines with 24GB of memory.

我们正在使用具有 24GB 内存的双核四核英特尔至强处理器。

You need sufficient memory to buffer active readers and writers. You can do a back-of-the-envelope estimate of memory needs by assuming you want to be able to buffer for 30 seconds and compute your memory need as write\_throughput\*30.

您需要足够的内存来缓存活动的 readers 和 writers。假设您希望能够缓冲 30 秒并计算您的内存需求为 `_throughput * 30`，您可以对内存需求进行后期估算。

The disk throughput is important. We have 8x7200 rpm SATA drives. In general disk throughput is the performance bottleneck, and more disks is better. Depending on how you configure flush behavior you may or may not benefit from more expensive disks (if you force flush often then higher RPM SAS drives may be better).

磁盘吞吐量很重要。我们使用 8x7200 转的 SATA 硬盘。一般来说，磁盘吞吐量是性能瓶颈，更多的磁盘更好。根据配置刷新行为的方式，您可能会也可能不会从更昂贵的磁盘中受益（如果您经常强制刷新，那么更高的 RPM SAS 驱动器可能会更好）。


#### [OS](#os)<a id="os"></a>

Kafka should run well on any unix system and has been tested on Linux and Solaris.

Kafka 应该在任何 Unix 系统上运行良好，并且已经在 Linux 和 Solaris 上进行了测试。

We have seen a few issues running on Windows and Windows is not currently a well supported platform though we would be happy to change that.

我们已经看到在 Windows 和 Windows 上运行的一些问题目前还不是很好的支持平台，尽管我们很乐意改变这一点。

It is unlikely to require much OS-level tuning, but there are two potentially important OS-level configurations:

这不太需要很多操作系统级的调整，但是有两个潜在的重要的操作系统级配置：

* File descriptor limits: Kafka uses file descriptors for log segments and open connections. If a broker hosts many partitions, consider that the broker needs at least \(number\_of\_partitions\)\*\(partition\_size\/segment\_size\) to track all log segments in addition to the number of connections the broker makes. We recommend at least 100000 allowed file descriptors for the broker processes as a starting point.
* Max socket buffer size: can be increased to enable high-performance data transfer between data centers as [**described here**](http://www.psc.edu/index.php/networking/641-tcp-tune).

* 文件描述符限制：Kafka 为日志段和打开的连接使用文件描述符。如果代理托管许多分区，请考虑代理至少需要、(number\_of\_partitions\)\*\(partition\_size\/segment\_size\) 以跟踪所有日志段以及 broker 制造。我们推荐至少 100000 个允许的代理进程文件描述符作为起点。
* 最大套接字缓冲区大小：可以增加数据中心之间的高性能数据传输，如 [**here**](http://www.psc.edu/index.php/networking/641-tcp-tune )。


#### [Disks and Filesystem](#diskandfs)<a id="diskandfs"></a>

We recommend using multiple drives to get good throughput and not sharing the same drives used for Kafka data with application logs or other OS filesystem activity to ensure good latency. You can either RAID these drives together into a single volume or format and mount each drive as its own directory. Since Kafka has replication the redundancy provided by RAID can also be provided at the application level. This choice has several tradeoffs.

我们建议使用多个驱动器以获得良好的吞吐量，而不是与应用程序日志或其他操作系统文件系统活动共享用于 Kafka 数据的相同驱动器，以确保良好的延迟。您可以将这些驱动器一起 RAID 成单个卷或格式，并将每个驱动器安装为自己的目录。由于 Kafka 具有复制功能，RAID 提供的冗余也可以在应用程序级别提供。这个选择有几个折衷。

If you configure multiple data directories partitions will be assigned round-robin to data directories. Each partition will be entirely in one of the data directories. If data is not well balanced among partitions this can lead to load imbalance between disks.

如果您配置多个数据目录，则会将分区循环分配到数据目录。每个分区将完全位于其中一个数据目录中。如果分区间的数据不均衡，则可能导致磁盘之间的负载不均衡。

RAID can potentially do better at balancing load between disks \(although it doesn't always seem to\) because it balances load at a lower level. The primary downside of RAID is that it is usually a big performance hit for write throughput and reduces the available disk space.

RAID 可以更好地平衡磁盘之间的负载（尽管看起来并不总是如此），因为它在较低的级别平衡负载。 RAID 的主要缺点是写入吞吐量通常会造成很大的性能下降，并且会减少可用的磁盘空间。

Another potential benefit of RAID is the ability to tolerate disk failures. However our experience has been that rebuilding the RAID array is so I\/O intensive that it effectively disables the server, so this does not provide much real availability improvement.

RAID 的另一个潜在好处是可以容忍磁盘故障。然而，我们的经验是，重建 RAID 阵列的工作量很大，因此它会有效地禁用服务器，所以这不会提供很大的实际可用性改进。

#### [Application vs. OS Flush Management](#appvsosflush)<a id="appvsosflush"></a>

Kafka always immediately writes all data to the filesystem and supports the ability to configure the flush policy that controls when data is forced out of the OS cache and onto disk using the flush. This flush policy can be controlled to force data to disk after a period of time or after a certain number of messages has been written. There are several choices in this configuration.

Kafka 总是立即将所有数据写入文件系统，并支持配置刷新策略的功能，该策略控制何时使用刷新将数据从 OS 缓存中移出到磁盘上。可以控制该刷新策略以在一段时间之后或写入一定数量的消息之后强制数据到磁盘。这种配置有几种选择。

Kafka must eventually call fsync to know that data was flushed. When recovering from a crash for any log segment not known to be fsync'd Kafka will check the integrity of each message by checking its CRC and also rebuild the accompanying offset index file as part of the recovery process executed on startup.

Kafka 最终必须调用 fsync 才能知道数据已被刷新。从任何未知的 fsync'd 日志段的崩溃中恢复时，Kafka 将通过检查每个消息的 CRC 来检查其完整性，并在启动时执行的恢复过程中重建随附的偏移量索引文件。

Note that durability in Kafka does not require syncing data to disk, as a failed node will always recover from its replicas.

请注意，Kafka 中的持久性不需要将数据同步到磁盘，因为失败的节点将始终从其副本中恢复。

We recommend using the default flush settings which disable application fsync entirely. This means relying on the background flush done by the OS and Kafka's own background flush. This provides the best of all worlds for most uses: no knobs to tune, great throughput and latency, and full recovery guarantees. We generally feel that the guarantees provided by replication are stronger than sync to local disk, however the paranoid still may prefer having both and application level fsync policies are still supported.

我们建议使用完全禁用应用程序 fsync 的默认刷新设置。这意味着依靠操作系统和 Kafka 自己的后台刷新完成的背景刷新。这为大多数用途提供了最好的环境：无需调节旋钮，极大的吞吐量和延迟以及完全恢复保证。我们一般认为复制提供的保证比同步到本地磁盘更强，但偏执狂仍然可能更喜欢同时支持 fsync 和应用程序级别的策略。

The drawback of using application level flush settings is that it is less efficient in it's disk usage pattern \(it gives the OS less leeway to re-order writes\) and it can introduce latency as fsync in most Linux filesystems blocks writes to the file whereas the background flushing does much more granular page-level locking.

使用应用程序级别刷新设置的缺点是它的磁盘使用模式效率较低（它使操作系统没有重新排序写入的空间），并且它可能会引入延迟，因为大多数 Linux 文件系统块中的 fsync 会写入文件而背景刷新可以实现更加细化的页面级锁定。

In general you don't need to do any low-level tuning of the filesystem, but in the next few sections we will go over some of this in case it is useful.

一般而言，您不需要对文件系统进行任何低级调整，但在接下来的几节中，我们会在其中介绍其中的一些内容以防万一它有用。

#### [Understanding Linux OS Flush Behavior](#linuxflush)<a id="linuxflush"></a>

In Linux, data written to the filesystem is maintained in [**pagecache**](http://en.wikipedia.org/wiki/Page_cache) until it must be written out to disk (due to an application-level fsync or the OS's own flush policy). The flushing of data is done by a set of background threads called pdflush (or in post 2.6.32 kernels "flusher threads").

在 Linux 中，写入文件系统的数据在 [**pagecache**](http://en.wikipedia.org/wiki/Page_cache）中保存，直到它必须写入磁盘（由于应用程序级别的 fsync 或操作系统自己的刷新策略）。数据的刷新是通过一组名为 pdflush  的后台线程完成的（或者在 2.6.32 之后内核中的“刷新线程”)。


Pdflush has a configurable policy that controls how much dirty data can be maintained in cache and for how long before it must be written back to disk. This policy is described [**here**](http://www.westnet.com/~gsmith/content/linux-pdflush.htm). When Pdflush cannot keep up with the rate of data being written it will eventually cause the writing process to block incurring latency in the writes to slow down the accumulation of data.

Pdflush 有一个可配置的策略，用于控制在缓存中可以维护多少脏数据以及在必须将数据写回到磁盘之前多长时间。这项政策描述 [**here**](http://www.westnet.com/~gsmith/content/linux-pdflush.htm)。当 Pdflush 无法跟上正在写入的数据速率时，它最终会导致写入过程阻止写入中的等待时间，从而减慢数据的积累。

You can see the current state of OS memory usage by doing

您可以通过执行来查看 OS 内存使用情况的当前状态

```
  > cat /proc/meminfo

```

The meaning of these values are described in the link above.

这些值的含义在上面的链接中描述。

Using pagecache has several advantages over an in-process cache for storing data that will be written out to disk:

使用 pagecache 与存储进入磁盘的数据存储的进程内缓存相比有几个优点：

* The I/O scheduler will batch together consecutive small writes into bigger physical writes which improves throughput.
* The I/O scheduler will attempt to re-sequence writes to minimize movement of the disk head which improves throughput.
* It automatically uses all the free memory on the machine

* I/O 调度程序将连续的小写入批量转换为更大的物理写入，从而提高吞吐量。
* I/O 调度程序将尝试重新排序写入，以尽量减少磁盘磁头的移动，从而提高吞吐量。
* 它会自动使用机器上的所有可用内存


#### [Filesystem Selection](#filesystems)<a id="filesystems"></a>

Kafka uses regular files on disk, and as such it has no hard dependency on a specific filesystem. The two filesystems which have the most usage, however, are EXT4 and XFS. Historically, EXT4 has had more usage, but recent improvements to the XFS filesystem have shown it to have better performance characteristics for Kafka's workload with no compromise in stability.

Kafka 在磁盘上使用常规文件，因此它不依赖于特定的文件系统。然而，使用最多的两个文件系统是 EXT4 和 XFS。从历史上看，EXT4 有更多的用途，但最近对 XFS 文件系统的改进表明它具有更好的卡夫卡工作负载性能特性，而且不会影响稳定性。

Comparison testing was performed on a cluster with significant message loads, using a variety of filesystem creation and mount options. The primary metric in Kafka that was monitored was the "Request Local Time", indicating the amount of time append operations were taking. XFS resulted in much better local times \(160ms vs. 250ms+ for the best EXT4 configuration\), as well as lower average wait times. The XFS performance also showed less variability in disk performance.

使用各种文件系统创建和安装选项，在具有重要消息加载的群集上执行比较测试。 Kafka 中监控的主要指标是“请求本地时间”，表示所附加操作的时间量。 XFS 带来了更好的本地时间（160ms 比 250ms + 最佳 EXT4 配置），以及更低的平均等待时间。 XFS 性能也表现出较小的磁盘性能变化。

##### [General Filesystem Notes](#generalfs)<a id="generalfs"></a>

For any filesystem used for data directories, on Linux systems, the following options are recommended to be used at mount time:

对于用于数据目录的任何文件系统，在 Linux 系统上，建议在安装时使用以下选项：

* noatime: This option disables updating of a file's atime (last access time) attribute when the file is read. This can eliminate a significant number of filesystem writes, especially in the case of bootstrapping consumers. Kafka does not rely on the atime attributes at all, so it is safe to disable this.

* noatime：该选项禁止在读取文件时更新文件的 atime （last access time ）属性。这可以消除大量的文件系统写入，特别是在引导用户的情况下。 Kafka 根本不依赖 atime 属性，因此禁用这个属性是安全的。

##### [XFS Notes](#xfs)<a id="xfs"></a>

The XFS filesystem has a significant amount of auto-tuning in place, so it does not require any change in the default settings, either at filesystem creation time or at mount. The only tuning parameters worth considering are:

XFS 文件系统具有大量的自动调整功能，因此无需在文件系统创建时或挂载时对默认设置进行任何更改。唯一值得考虑的调整参数是：

* largeio: This affects the preferred I\/O size reported by the stat call. While this can allow for higher performance on larger disk writes, in practice it had minimal or no effect on performance.
* nobarrier: For underlying devices that have battery-backed cache, this option can provide a little more performance by disabling periodic write flushes. However, if the underlying device is well-behaved, it will report to the filesystem that it does not require flushes, and this option will have no effect.

* largeio：这会影响统计调用报告的首选 I/O 大小。虽然这可以在更大的磁盘写入时实现更高的性能，但实际上它对性能的影响很小或没有影响。
* nobarrier：对于具有电池备份缓存的底层设备，此选项可以通过禁用定期写入刷新来提供更高的性能。但是，如果底层设备运行良好，则会向文件系统报告不需要刷新，此选项不起作用。


##### [EXT4 Notes](#ext4)<a id="ext4"></a>

EXT4 is a serviceable choice of filesystem for the Kafka data directories, however getting the most performance out of it will require adjusting several mount options. In addition, these options are generally unsafe in a failure scenario, and will result in much more data loss and corruption. For a single broker failure, this is not much of a concern as the disk can be wiped and the replicas rebuilt from the cluster. In a multiple-failure scenario, such as a power outage, this can mean underlying filesystem \(and therefore data\) corruption that is not easily recoverable. The following options can be adjusted:

EXT4 是 Kafka 数据目录文件系统的一个可用选择，但要获得最高的性能，则需要调整多个安装选项。另外，这些选项在故障情况下通常是不安全的，并且会导致更多的数据丢失和损坏。对于单个代理故障，这不是什么大问题，因为可以擦除磁盘并从集群重建副本。在诸如停电等多故障情况下，这可能意味着不容易恢复的底层文件系统、（因此数据、）损坏。以下选项可以调整：

* data=writeback: Ext4 defaults to data=ordered which puts a strong order on some writes. Kafka does not require this ordering as it does very paranoid data recovery on all unflushed log. This setting removes the ordering constraint and seems to significantly reduce latency.
* Disabling journaling: Journaling is a tradeoff: it makes reboots faster after server crashes but it introduces a great deal of additional locking which adds variance to write performance. Those who don't care about reboot time and want to reduce a major source of write latency spikes can turn off journaling entirely.
* commit=num\_secs: This tunes the frequency with which ext4 commits to its metadata journal. Setting this to a lower value reduces the loss of unflushed data during a crash. Setting this to a higher value will improve throughput.
* nobh: This setting controls additional ordering guarantees when using data=writeback mode. This should be safe with Kafka as we do not depend on write ordering and improves throughput and latency.
* delalloc: Delayed allocation means that the filesystem avoid allocating any blocks until the physical write occurs. This allows ext4 to allocate a large extent instead of smaller pages and helps ensure the data is written sequentially. This feature is great for throughput. It does seem to involve some locking in the filesystem which adds a bit of latency variance.

* data = writeback：Ext4 默认为 data = ordered，这会在某些写入时发出强烈的顺序。 Kafka 不需要这样的排序，因为它对所有未刷新的日志进行非常偏执的数据恢复。此设置消除了排序约束，似乎显着减少了延迟。
* 禁用日志记录：日志记录是一种折衷方案：在服务器崩溃后，重新启动会更快，但会引入大量额外的锁定，从而增加写入性能的差异。那些不关心重启时间并希望减少写入延迟尖峰的主要来源的人可以完全关闭日志记录。
* commit = `num_secs`：调整 ext4 向其元数据日志提交的频率。将其设置为较低的值可减少崩溃期间未刷新数据的丢失。将其设置为更高的值将提高吞吐量。
* nobh：当使用 data = 回写模式时，此设置控制额外的订购保证。这对 Kafka 应该是安全的，因为我们不依赖写入顺序并提高吞吐量和延迟。
* delalloc：延迟分配意味着文件系统避免分配任何块直到物理写入发生。这允许 ext4 分配很大的范围而不是较小的页面，并有助于确保数据顺序写入。此功能对于吞吐量非常有用。它似乎涉及到文件系统中的一些锁定，这会增加一些延迟差异。


### [6.6 Monitoring](#monitoring)<a id="monitoring"></a>

Kafka uses Yammer Metrics for metrics reporting in both the server and the client. This can be configured to report stats using pluggable stats reporters to hook up to your monitoring system.

Kafka 在服务器和客户端都使用 Yammer 指标来进行度量报告。这可以配置为使用可插式统计记录器来报告统计信息，以便连接到您的监控系统。

The easiest way to see the available metrics is to fire up jconsole and point it at a running kafka client or server; this will allow browsing all metrics with JMX.

查看可用指标的最简单方法是启动 jconsole 并将其指向正在运行的 kafka 客户端或服务器；这将允许浏览 JMX 的所有指标。

We do graphing and alerting on the following metrics:

我们对以下指标进行图形化和提醒：

| **DescriptionMbean nameNormal value** |  |  |
| --- | --- | --- |
| Message in rate | kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec |  |
| Byte in rate | kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec |  |
| Request rate | kafka.network:type=RequestMetrics,name=RequestsPerSec,request={Produce\|FetchConsumer\|FetchFollower} |  |
| Byte out rate | kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec |  |
| Log flush rate and time | kafka.log:type=LogFlushStats,name=LogFlushRateAndTimeMs |  |
| \# of under replicated partitions \(\|ISR\| &lt; \|all replicas\|\) | kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions | 0 |
| Is controller active on broker | kafka.controller:type=KafkaController,name=ActiveControllerCount | only one broker in the cluster should have 1 |
| Leader election rate | kafka.controller:type=ControllerStats,name=LeaderElectionRateAndTimeMs | non-zero when there are broker failures |
| Unclean leader election rate | kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec | 0 |
| Partition counts | kafka.server:type=ReplicaManager,name=PartitionCount | mostly even across brokers |
| Leader replica counts | kafka.server:type=ReplicaManager,name=LeaderCount | mostly even across brokers |
| ISR shrink rate | kafka.server:type=ReplicaManager,name=IsrShrinksPerSec | If a broker goes down, ISR for some of the partitions will shrink. When that broker is up again, ISR will be expanded once the replicas are fully caught up. Other than that, the expected value for both ISR shrink rate and expansion rate is 0. |
| ISR expansion rate | kafka.server:type=ReplicaManager,name=IsrExpandsPerSec | See above |
| Max lag in messages btw follower and leader replicas | kafka.server:type=ReplicaFetcherManager,name=MaxLag,clientId=Replica | lag should be proportional to the maximum batch size of a produce request. |
| Lag in messages per follower replica | kafka.server:type=FetcherLagMetrics,name=ConsumerLag,clientId=\(\[-.\w\]+\),topic=\(\[-.\w\]+\),partition=\(\[0-9\]+\) | lag should be proportional to the maximum batch size of a produce request. |
| Requests waiting in the producer purgatory | kafka.server:type=ProducerRequestPurgatory,name=PurgatorySize | non-zero if ack=-1 is used |
| Requests waiting in the fetch purgatory | kafka.server:type=FetchRequestPurgatory,name=PurgatorySize | size depends on fetch.wait.max.ms in the consumer |
| Request total time | kafka.network:type=RequestMetrics,name=TotalTimeMs,request={Produce\|FetchConsumer\|FetchFollower} | broken into queue, local, remote and response send time |
| Time the request waiting in the request queue | kafka.network:type=RequestMetrics,name=QueueTimeMs,request={Produce\|FetchConsumer\|FetchFollower} |  |
| Time the request being processed at the leader | kafka.network:type=RequestMetrics,name=LocalTimeMs,request={Produce\|FetchConsumer\|FetchFollower} |  |
| Time the request waits for the follower | kafka.network:type=RequestMetrics,name=RemoteTimeMs,request={Produce\|FetchConsumer\|FetchFollower} | non-zero for produce requests when ack=-1 |
| Time to send the response | kafka.network:type=RequestMetrics,name=ResponseSendTimeMs,request={Produce\|FetchConsumer\|FetchFollower} |  |
| Number of messages the consumer lags behind the producer by | kafka.consumer:type=ConsumerFetcherManager,name=MaxLag,clientId=\(\[-.\w\]+\) |  |
| The average fraction of time the network processors are idle | kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent | between 0 and 1, ideally &gt; 0.3 |
| The average fraction of time the request handler threads are idle | kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent | between 0 and 1, ideally &gt; 0.3 |
| Quota metrics per client-id | kafka.server:type={Produce\|Fetch},client-id==\(\[-.\w\]+\) | Two attributes. throttle-time indicates the amount of time in ms the client-id was throttled. Ideally = 0. byte-rate indicates the data produce\/consume rate of the client in bytes\/sec. |

#### [New producer monitoring](#new_producer_monitoring)<a id="new_producer_monitoring"></a>

The following metrics are available on new producer instances.

| **Metric\/Attribute nameDescriptionMbean name** |  |  |
| --- | --- | --- |
| waiting-threads | The number of user threads blocked waiting for buffer memory to enqueue their records. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| buffer-total-bytes | The maximum amount of buffer memory the client can use \(whether or not it is currently used\). | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| buffer-available-bytes | The total amount of buffer memory that is not being used \(either unallocated or in the free list\). | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| bufferpool-wait-time | The fraction of time an appender waits for space allocation. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| batch-size-avg | The average number of bytes sent per partition per-request. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| batch-size-max | The max number of bytes sent per partition per-request. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| compression-rate-avg | The average compression rate of record batches. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-queue-time-avg | The average time in ms record batches spent in the record accumulator. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-queue-time-max | The maximum time in ms record batches spent in the record accumulator. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| request-latency-avg | The average request latency in ms. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| request-latency-max | The maximum request latency in ms. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-send-rate | The average number of records sent per second. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| records-per-request-avg | The average number of records per request. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-retry-rate | The average per-second number of retried record sends. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-error-rate | The average per-second number of record sends that resulted in errors. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-size-max | The maximum record size. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| record-size-avg | The average record size. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| requests-in-flight | The current number of in-flight requests awaiting a response. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| metadata-age | The age in seconds of the current producer metadata being used. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| connection-close-rate | Connections closed per second in the window. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| connection-creation-rate | New connections established per second in the window. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| network-io-rate | The average number of network operations \(reads or writes\) on all connections per second. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| outgoing-byte-rate | The average number of outgoing bytes sent per second to all servers. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| request-rate | The average number of requests sent per second. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| request-size-avg | The average size of all requests in the window. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| request-size-max | The maximum size of any request sent in the window. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| incoming-byte-rate | Bytes\/second read off all sockets. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| response-rate | Responses received sent per second. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| select-rate | Number of times the I\/O layer checked for new I\/O to perform per second. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| io-wait-time-ns-avg | The average length of time the I\/O thread spent waiting for a socket ready for reads or writes in nanoseconds. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| io-wait-ratio | The fraction of time the I\/O thread spent waiting. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| io-time-ns-avg | The average length of time for I\/O per select call in nanoseconds. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| io-ratio | The fraction of time the I\/O thread spent doing I\/O. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| connection-count | The current number of active connections. | kafka.producer:type=producer-metrics,client-id=\(\[-.\w\]+\) |
| outgoing-byte-rate | The average number of outgoing bytes sent per second for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| request-rate | The average number of requests sent per second for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| request-size-avg | The average size of all requests in the window for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| request-size-max | The maximum size of any request sent in the window for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| incoming-byte-rate | The average number of responses received per second for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| request-latency-avg | The average request latency in ms for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| request-latency-max | The maximum request latency in ms for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| response-rate | Responses received sent per second for a node. | kafka.producer:type=producer-node-metrics,client-id=\(\[-.\w\]+\),node-id=\(\[0-9\]+\) |
| record-send-rate | The average number of records sent per second for a topic. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\),topic=\(\[-.\w\]+\) |
| byte-rate | The average number of bytes sent per second for a topic. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\),topic=\(\[-.\w\]+\) |
| compression-rate | The average compression rate of record batches for a topic. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\),topic=\(\[-.\w\]+\) |
| record-retry-rate | The average per-second number of retried record sends for a topic. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\),topic=\(\[-.\w\]+\) |
| record-error-rate | The average per-second number of record sends that resulted in errors for a topic. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\),topic=\(\[-.\w\]+\) |
| produce-throttle-time-max | The maximum time in ms a request was throttled by a broker. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\) |
| produce-throttle-time-avg | The average time in ms a request was throttled by a broker. | kafka.producer:type=producer-topic-metrics,client-id=\(\[-.\w\]+\) |

We recommend monitoring GC time and other stats and various server stats such as CPU utilization, I\/O service time, etc. On the client side, we recommend monitoring the message\/byte rate \(global and per topic\), request rate\/size\/time, and on the consumer side, max lag in messages among all partitions and min fetch request rate. For a consumer to keep up, max lag needs to be less than a threshold and min fetch rate needs to be larger than 0.

#### [Audit](#basic_ops_audit)<a id="basic_ops_audit"></a>

The final alerting we do is on the correctness of the data delivery. We audit that every message that is sent is consumed by all consumers and measure the lag for this to occur. For important topics we alert if a certain completeness is not achieved in a certain time period. The details of this are discussed in KAFKA-260.

我们所做的最终警报是关于数据交付的正确性。我们审计发送的每条消息都被所有消费者消费，并衡量发生这种情况的时滞。对于重要的话题，如果在某个时间段内没有达到某种完整性，我们会提醒。这些细节在 KAFKA-260 中讨论。

### [6.7 ZooKeeper](#zk)<a id="zk"></a>

#### [Stable version](#zkversion)<a id="zkversion"></a>

The current stable branch is 3.4 and the latest release of that branch is 3.4.6, which is the one ZkClient 0.7 uses. ZkClient is the client layer Kafka uses to interact with ZooKeeper.

目前稳定的分支是 3.4，该分支的最新版本是 3.4.6，这是 ZkClient 0.7 使用的。 ZkClient 是 Kafka 用来与 ZooKeeper 进行交互的客户端层。

#### [Operationalizing ZooKeeper](#zkops)<a id="zkops"></a>

Operationally, we do the following for a healthy ZooKeeper installation:

在操作上，我们为 ZooKeeper 安装执行以下操作：

* Redundancy in the physical/hardware/network layout: try not to put them all in the same rack, decent (but don't go nuts) hardware, try to keep redundant power and network paths, etc. A typical ZooKeeper ensemble has 5 or 7 servers, which tolerates 2 and 3 servers down, respectively. If you have a small deployment, then using 3 servers is acceptable, but keep in mind that you'll only be able to tolerate 1 server down in this case.
* I/O segregation: if you do a lot of write type traffic you'll almost definitely want the transaction logs on a dedicated disk group. Writes to the transaction log are synchronous (but batched for performance), and consequently, concurrent writes can significantly affect performance. ZooKeeper snapshots can be one such a source of concurrent writes, and ideally should be written on a disk group separate from the transaction log. Snapshots are writtent to disk asynchronously, so it is typically ok to share with the operating system and message log files. You can configure a server to use a separate disk group with the dataLogDir parameter.
* Application segregation: Unless you really understand the application patterns of other apps that you want to install on the same box, it can be a good idea to run ZooKeeper in isolation (though this can be a balancing act with the capabilities of the hardware).
* Use care with virtualization: It can work, depending on your cluster layout and read/write patterns and SLAs, but the tiny overheads introduced by the virtualization layer can add up and throw off ZooKeeper, as it can be very time sensitive
* ZooKeeper configuration: It's java, make sure you give it 'enough' heap space /We usually run them with 3-5G, but that's mostly due to the data set size we have here). Unfortunately we don't have a good formula for it, but keep in mind that allowing for more ZooKeeper state means that snapshots can become large, and large snapshots affect recovery time. In fact, if the snapshot becomes too large (a few gigabytes), then you may need to increase the initLimit parameter to give enough time for servers to recover and join the ensemble.
* Monitoring: Both JMX and the 4 letter words (4lw) commands are very useful, they do overlap in some cases (and in those cases we prefer the 4 letter commands, they seem more predictable, or at the very least, they work better with the LI monitoring infrastructure)
* Don't overbuild the cluster: large clusters, especially in a write heavy usage pattern, means a lot of intracluster communication (quorums on the writes and subsequent cluster member updates), but don't underbuild it (and risk swamping the cluster). Having more servers adds to your read capacity.

Overall, we try to keep the ZooKeeper system as small as will handle the load (plus standard growth capacity planning) and as simple as possible. We try not to do anything fancy with the configuration or application layout as compared to the official release as well as keep it as self contained as possible. For these reasons, we tend to skip the OS packaged versions, since it has a tendency to try to put things in the OS standard hierarchy, which can be 'messy', for want of a better way to word it.

总的来说，我们尽量让 ZooKeeper 系统尽量小，只要能够负载基本的使用已经未来可能的增长。与官方发布相比，我们尽量不对配置或应用程序布局进行任何操作，并尽可能 r 让其自包含。由于这些原因，为了更好的使用他，我们倾向于不使用操作系统打包的版本，因为它会尝试将操作系统标准层次结构中的东西放置在“杂乱”的位置。

