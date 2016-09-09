# Apache Kafka 官方文档中文版

Apache Kafka是一个高吞吐量分布式消息系统。

Kafka在国内很多公司都有大规模的应用，但关于它的中文资料并不多，只找到了12年某版本的[设计章节的翻译](http://www.oschina.net/translate/kafka-design?lang=chs&page=1#)。

为了方便大家学习交流，尽最大努力翻译一下完整的官方的手册。

原文版本选择当前最新的[Kafka 0.10.0的文档](http://kafka.apache.org/documentation.html)（2016-08）。

前辈们在OS China上翻译的[设计章节](http://www.oschina.net/translate/kafka-design?lang=chs&page=1#)非常优秀，如果之前没有阅读过推荐先参考一下。

---

阅读地址：[Apache Kafka 官方文档中文版](http://kafkadoc.beanmr.com/)

源地址：[Kafka 0.10.0 Documentation](http://kafka.apache.org/documentation.html)

Github: [BeanMr](https://github.com/BeanMr)/[apache-kafka-documentation-cn](https://github.com/BeanMr/apache-kafka-documentation-cn)

Gitbook: [Apache Kafka Documentation CN](https://www.gitbook.com/book/ddfeng/apache-kafka-documentation-cn/details)

---

译者：[@D2Feng](https://github.com/BeanMr)

翻译采用章节中英文对照的形式进行，未翻译的章节保持原文。

译文章节组织及内容尽量保持与原文一直，但有时某些句子直译会有些蹩脚，所以可能会进行一些语句上调整。

因为本人能力和精力有限，译文如有不妥欢迎[提issue](https://github.com/BeanMr/apache-kafka-documentation-cn/issues)，更期望大家能共同参与进来。

## 参与翻译Pull Request流程

小伙伴[@numbbbbb](https://github.com/numbbbbb)在《The Swift Programming Language》对协作流程中进行了详细的介绍，小伙伴[@looly](https://github.com/looly)在他的ES翻译中总结了一下，我抄过来并再次感谢他们的分享。

1. 首先fork的项目[apache-kafka-documentation-cn](https://github.com/BeanMr/apache-kafka-documentation-cn)到你自己的Github
2. 把fork过去的项目也就是你的项目clone到你的本地 
3. 运行 `git remote add ddfeng` 把我的库添加为远端库 
4. 运行 `git pull ddfeng master` 拉取并合并到本地 
5. 翻译内容或者更正之前的内容。
6. commit后push到自己的库（`git push origin master`） 
7. 登录Github在你首页可以看到一个 `pull request` 按钮，点击它，填写一些说明信息，然后提交即可。 

1~3是初始化操作，执行一次即可。

在提交前请先执行第4步同步库，这样可以及时发现和避免冲突，然后执行5~7既可。

*JustDoIT，您的任何建议和尝试都值得尊重！*
