const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDocument,
  defaultKnowledgeState,
  knowledgeContext,
  searchKnowledge,
  upsertDocument
} = require('../knowledge-engine');

function fixture() {
  let state = defaultKnowledgeState();
  state = upsertDocument(state, createDocument({
    id: 'chat-doc', libraryId: 'library-chat', title: '日语课程笔记', fileType: 'md', sourcePath: 'D:/notes/n2.md',
    text: '日语 N2 的复习重点包括语法、听力和阅读。每天复习二十个单词。'
  }));
  state = upsertDocument(state, createDocument({
    id: 'local-doc', libraryId: 'library-local', title: '私人账目', fileType: 'txt', sourcePath: 'D:/private.txt',
    text: '本月私人预算是两千元，这段内容只能在本地检索。'
  }));
  return state;
}

test('local search returns excerpts and source citations', () => {
  const results = searchKnowledge(fixture(), 'N2 语法', { mode: 'local' });
  assert.equal(results[0].title, '日语课程笔记');
  assert.match(results[0].citation, /资料:/);
});

test('local-only and locked libraries never enter chat context', () => {
  const state = fixture();
  const privateContext = knowledgeContext(state, [{ role: 'user', content: '我的私人预算是多少？' }]);
  const studyContext = knowledgeContext(state, [{ role: 'user', content: 'N2 复习重点是什么？' }]);
  assert.equal(privateContext, '');
  assert.match(studyContext, /日语课程笔记/);
  assert.doesNotMatch(studyContext, /私人预算/);
});

test('reimporting the same source updates instead of duplicating', () => {
  let state = fixture();
  state = upsertDocument(state, createDocument({
    libraryId: 'library-chat', title: '日语课程笔记', sourcePath: 'D:/notes/n2.md', fileType: 'md', text: '更新后的 N2 笔记。'
  }));
  assert.equal(state.documents.filter((item) => item.sourcePath === 'D:/notes/n2.md').length, 1);
  assert.match(state.documents.find((item) => item.sourcePath === 'D:/notes/n2.md').chunks[0].text, /更新后/);
});
