# SAG 学习笔记

原论文：SAG: SQL-Retrieval Augmented Generation with Query-Time Dynamic Hyperedges（arXiv:2606.15971v2，2026-08-25）。作者将文档片段表示为完整事件与多个实体的关联，检索时以共享实体作为连接键，按查询构造局部关系，而不是维护全局图。输出仍指向原片段。论文报告了多跳问答效果，不能直接外推到小说剧情调度。

普通故事示例：
- E1：旧航图带有北辰印记。
- E2：北辰印记是制图师协会认证标识。
- E3：协会保存历史船只登记簿。
查询只说旧航图，仍可从 E1 经实体北辰印记到 E2，再经制图师协会到 E3。关联仅是候选证据，不代表用户已阅读登记簿。

原 SAG 使用关系存储、语义及词法检索、查询时 SQL join 和源证据选择；本扩展使用 JS Map 模拟有界关联连接，保留可追溯路径，复用已有种子检索。没有复现原论文训练、打分或基准。后续普通知识库研究可考虑独立 SQL 关系表（chunks、events、entities、event_entities）、实体消歧、局部扩展评分、召回与误召回评估。

参考：https://arxiv.org/abs/2606.15971 ; https://github.com/Zleap-AI/SAG
