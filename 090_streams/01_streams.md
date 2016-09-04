## [**9. Kafka Streams**](http://kafka.apache.org/documentation.html#streams)

### [**9.1 Overview**](http://kafka.apache.org/documentation.html#streams_overview)

Kafka Streams is a client library for processing and analyzing data stored in Kafka and either write the resulting data back to Kafka or send the final output to an external system. It builds upon important stream processing concepts such as properly distinguishing between event time and processing time, windowing support, and simple yet efficient management of application state. Kafka Streams has a **low barrier to entry**: You can quickly write and run a small-scale proof-of-concept on a single machine; and you only need to run additional instances of your application on multiple machines to scale up to high-volume production workloads. Kafka Streams transparently handles the load balancing of multiple instances of the same application by leveraging Kafka's parallelism model.

Some highlights of Kafka Streams:

* Designed as a **simple and lightweight client library**, which can be easily embedded in any Java application and integrated with any existing packaging, deployment and operational tools that users have for their streaming applications.
* Has **no external dependencies on systems other than Apache Kafka itself** as the internal messaging layer; notably, it uses Kafka's partitioning model to horizontally scale processing while maintaining strong ordering guarantees.
* Supports **fault-tolerant local state**, which enables very fast and efficient stateful operations like joins and windowed aggregations.
* Employs **one-record-at-a-time processing** to achieve low processing latency, and supports **event-time based windowing operations**.
* Offers necessary stream processing primitives, along with a **high-level Streams DSL** and a **low-level Processor API**.

### [**9.2 Developer Guide**](http://kafka.apache.org/documentation.html#streams_developer)

There is a [**quickstart**](http://kafka.apache.org/documentation.html#quickstart_kafkastreams) example that provides how to run a stream processing program coded in the Kafka Streams library. This section focuses on how to write, configure, and execute a Kafka Streams application.

#### [**Core Concepts**](http://kafka.apache.org/documentation.html#streams_concepts)

We first summarize the key concepts of Kafka Streams.

##### [**Stream Processing Topology**](http://kafka.apache.org/documentation.html#streams_topology)

* A **stream**is the most important abstraction provided by Kafka Streams: it represents an unbounded, continuously updating data set. A stream is an ordered, replayable, and fault-tolerant sequence of immutable data records, where a **data record** is defined as a key-value pair.
* A stream processing application written in Kafka Streams defines its computational logic through one or more **processor topologies**, where a processor topology is a graph of stream processors \(nodes\) that are connected by streams \(edges\).
* A **stream processor** is a node in the processor topology; it represents a processing step to transform data in streams by receiving one input record at a time from its upstream processors in the topology, applying its operation to it, and may subsequently producing one or more output records to its downstream processors.

Kafka Streams offers two ways to define the stream processing topology: the [**Kafka Streams DSL**](http://kafka.apache.org/documentation.html#streams_dsl) provides the most common data transformation operations such as `map` and `filter`; the lower-level [**Processor API**](http://kafka.apache.org/documentation.html#streams_processor) allows developers define and connect custom processors as well as to interact with [**state stores**](http://kafka.apache.org/documentation.html#streams_state).

##### [**Time**](http://kafka.apache.org/documentation.html#streams_time)

A critical aspect in stream processing is the notion of **time**, and how it is modeled and integrated. For example, some operations such as **windowing** are defined based on time boundaries.

Common notions of time in streams are:

* **Event time** - The point in time when an event or data record occurred, i.e. was originally created "at the source".
* **Processing time** - The point in time when the event or data record happens to be processed by the stream processing application, i.e. when the record is being consumed. The processing time may be milliseconds, hours, or days etc. later than the original event time.

Kafka Streams assigns a **timestamp** to every data record via the `TimestampExtractor` interface. Concrete implementations of this interface may retrieve or compute timestamps based on the actual contents of data records such as an embedded timestamp field to provide event-time semantics, or use any other approach such as returning the current wall-clock time at the time of processing, thereby yielding processing-time semantics to stream processing applications. Developers can thus enforce different notions of time depending on their business needs. For example, per-record timestamps describe the progress of a stream with regards to time \(although records may be out-of-order within the stream\) and are leveraged by time-dependent operations such as joins.

##### [**States**](http://kafka.apache.org/documentation.html#streams_state)

Some stream processing applications don't require state, which means the processing of a message is independent from the processing of all other messages. However, being able to maintain state opens up many possibilities for sophisticated stream processing applications: you can join input streams, or group and aggregate data records. Many such stateful operators are provided by the [**Kafka Streams DSL**](http://kafka.apache.org/documentation.html#streams_dsl).

Kafka Streams provides so-called **state stores**, which can be used by stream processing applications to store and query data. This is an important capability when implementing stateful operations. Every task in Kafka Streams embeds one or more state stores that can be accessed via APIs to store and query data required for processing. These state stores can either be a persistent key-value store, an in-memory hashmap, or another convenient data structure. Kafka Streams offers fault-tolerance and automatic recovery for local state stores.





As we have mentioned above, the computational logic of a Kafka Streams application is defined as a [**processor topology**](http://kafka.apache.org/documentation.html#streams_topology). Currently Kafka Streams provides two sets of APIs to define the processor topology, which will be described in the subsequent sections.

#### [**Low-Level Processor API**](http://kafka.apache.org/documentation.html#streams_processor)

##### [**Processor**](http://kafka.apache.org/documentation.html#streams_processor_process)

Developers can define their customized processing logic by implementing the `Processor` interface, which provides `process` and `punctuate` methods. The `process` method is performed on each of the received record; and the `punctuate` method is performed periodically based on elapsed time. In addition, the processor can maintain the current `ProcessorContext` instance variable initialized in the `init` method, and use the context to schedule the punctuation period \(`context().schedule`\), to forward the modified \/ new key-value pair to downstream processors \(`context().forward`\), to commit the current processing progress \(`context().commit`\), etc.

```
    public class MyProcessor extends Processor {
        private ProcessorContext context;
        private KeyValueStore kvStore;

        @Override
        @SuppressWarnings("unchecked")
        public void init(ProcessorContext context) {
            this.context = context;
            this.context.schedule(1000);
            this.kvStore = (KeyValueStore) context.getStateStore("Counts");
        }

        @Override
        public void process(String dummy, String line) {
            String[] words = line.toLowerCase().split(" ");

            for (String word : words) {
                Integer oldValue = this.kvStore.get(word);

                if (oldValue == null) {
                    this.kvStore.put(word, 1);
                } else {
                    this.kvStore.put(word, oldValue + 1);
                }
            }
        }

        @Override
        public void punctuate(long timestamp) {
            KeyValueIterator iter = this.kvStore.all();

            while (iter.hasNext()) {
                KeyValue entry = iter.next();
                context.forward(entry.key, entry.value.toString());
            }

            iter.close();
            context.commit();
        }

        @Override
        public void close() {
            this.kvStore.close();
        }
    };

```

In the above implementation, the following actions are performed:

* In the `init` method, schedule the punctuation every 1 second and retrieve the local state store by its name "Counts".
* In the `process` method, upon each received record, split the value string into words, and update their counts into the state store \(we will talk about this feature later in the section\).
* In the `punctuate` method, iterate the local state store and send the aggregated counts to the downstream processor, and commit the current stream state.



##### [**Processor Topology**](http://kafka.apache.org/documentation.html#streams_processor_topology)

With the customized processors defined in the Processor API, developers can use the `TopologyBuilder` to build a processor topology by connecting these processors together:

```
    TopologyBuilder builder = new TopologyBuilder();

    builder.addSource("SOURCE", "src-topic")

        .addProcessor("PROCESS1", MyProcessor1::new /* the ProcessorSupplier that can generate MyProcessor1 */, "SOURCE")
        .addProcessor("PROCESS2", MyProcessor2::new /* the ProcessorSupplier that can generate MyProcessor2 */, "PROCESS1")
        .addProcessor("PROCESS3", MyProcessor3::new /* the ProcessorSupplier that can generate MyProcessor3 */, "PROCESS1")

        .addSink("SINK1", "sink-topic1", "PROCESS1")
        .addSink("SINK2", "sink-topic2", "PROCESS2")
        .addSink("SINK3", "sink-topic3", "PROCESS3");

```

There are several steps in the above code to build the topology, and here is a quick walk through:

* First of all a source node named "SOURCE" is added to the topology using the `addSource` method, with one Kafka topic "src-topic" fed to it.
* Three processor nodes are then added using the `addProcessor` method; here the first processor is a child of the "SOURCE" node, but is the parent of the other two processors.
* Finally three sink nodes are added to complete the topology using the `addSink` method, each piping from a different parent processor node and writing to a separate topic.



##### [**Local State Store**](http://kafka.apache.org/documentation.html#streams_processor_statestore)

Note that the Processor API is not limited to only accessing the current records as they arrive, but can also maintain local state stores that keep recently arrived records to use in stateful processing operations such as aggregation or windowed joins. To take advantage of this local states, developers can use the`TopologyBuilder.addStateStore` method when building the processor topology to create the local state and associate it with the processor nodes that needs to access it; or they can connect a created local state store with the existing processor nodes through`TopologyBuilder.connectProcessorAndStateStores`.

```
    TopologyBuilder builder = new TopologyBuilder();

    builder.addSource("SOURCE", "src-topic")

        .addProcessor("PROCESS1", MyProcessor1::new, "SOURCE")
        // create the in-memory state store "COUNTS" associated with processor "PROCESS1"
        .addStateStore(Stores.create("COUNTS").withStringKeys().withStringValues().inMemory().build(), "PROCESS1")
        .addProcessor("PROCESS2", MyProcessor3::new /* the ProcessorSupplier that can generate MyProcessor3 */, "PROCESS1")
        .addProcessor("PROCESS3", MyProcessor3::new /* the ProcessorSupplier that can generate MyProcessor3 */, "PROCESS1")

        // connect the state store "COUNTS" with processor "PROCESS2"
        .connectProcessorAndStateStores("PROCESS2", "COUNTS");

        .addSink("SINK1", "sink-topic1", "PROCESS1")
        .addSink("SINK2", "sink-topic2", "PROCESS2")
        .addSink("SINK3", "sink-topic3", "PROCESS3");

```



In the next section we present another way to build the processor topology: the Kafka Streams DSL.

#### [**High-Level Streams DSL**](http://kafka.apache.org/documentation.html#streams_dsl)

To build a processor topology using the Streams DSL, developers can apply the `KStreamBuilder` class, which is extended from the `TopologyBuilder`. A simple example is included with the source code for Kafka in the `streams/examples` package. The rest of this section will walk through some code to demonstrate the key steps in creating a topology using the Streams DSL, but we recommend developers to read the full example source codes for details.

##### [**Create Source Streams from Kafka**](http://kafka.apache.org/documentation.html#streams_dsl_source)

Either a **record stream** \(defined as `KStream`\) or a **changelog stream** \(defined as `KTable`\) can be created as a source stream from one or more Kafka topics \(for `KTable` you can only create the source stream from a single topic\).

```
    KStreamBuilder builder = new KStreamBuilder();

    KStream source1 = builder.stream("topic1", "topic2");
    KTable source2 = builder.table("topic3");

```

##### [**Transform a stream**](http://kafka.apache.org/documentation.html#streams_dsl_transform)

There is a list of transformation operations provided for `KStream` and `KTable` respectively. Each of these operations may generate either one or more `KStream` and `KTable` objects and can be translated into one or more connected processors into the underlying processor topology. All these transformation methods can be chained together to compose a complex processor topology. Since `KStream` and `KTable` are strongly typed, all these transformation operations are defined as generics functions where users could specify the input and output data types.

Among these transformations, `filter`, `map`, `mapValues`, etc, are stateless transformation operations and can be applied to both `KStream` and `KTable`, where users can usually pass a customized function to these functions as a parameter, such as `Predicate` for `filter`, `KeyValueMapper` for `map`, etc:

```
    // written in Java 8+, using lambda expressions
    KStream mapped = source1.mapValue(record -> record.get("category"));

```

Stateless transformations, by definition, do not depend on any state for processing, and hence implementation-wise they do not require a state store associated with the stream processor; Stateful transformations, on the other hand, require accessing an associated state for processing and producing outputs. For example, in `join` and `aggregate` operations, a windowing state is usually used to store all the received records within the defined window boundary so far. The operators can then access these accumulated records in the store and compute based on them.

```
    // written in Java 8+, using lambda expressions
    KTable, Long> counts = source1.aggregateByKey(
        () -> 0L,  // initial value
        (aggKey, value, aggregate) -> aggregate + 1L,   // aggregating value
        TimeWindows.of("counts",5000L).advanceBy(1000L), // intervals in milliseconds
    );

    KStream joined = source1.leftJoin(source2,
        (record1, record2) -> record1.get("user") + "-" + record2.get("region");
    );

```

##### [**Write streams back to Kafka**](http://kafka.apache.org/documentation.html#streams_dsl_sink)

At the end of the processing, users can choose to \(continuously\) write the final resulted streams back to a Kafka topic through `KStream.to` and `KTable.to`.

```
    joined.to("topic4");

```

If your application needs to continue reading and processing the records after they have been materialized to a topic via `to` above, one option is to construct a new stream that reads from the output topic; Kafka Streams provides a convenience method called `through`:

```
    // equivalent to
    //
    // joined.to("topic4");
    // materialized = builder.stream("topic4");
    KStream materialized = joined.through("topic4");

```





Besides defining the topology, developers will also need to configure their applications in `StreamsConfig`before running it. A complete list of Kafka Streams configs can be found [**here**](http://kafka.apache.org/documentation.html#streamsconfigs).



