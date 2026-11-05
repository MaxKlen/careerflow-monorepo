import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from 'react-native';
import { useCareer } from '../../CareerContext';
import { taskStatusLabel } from '../../domain';
import { Button, Card, Header, Page, C, Body } from '../../ui';

export default function TasksScreen() {
  const { ready, state, careerSaveStatus, addTask, updateTask } = useCareer();
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState('');
  const successToast = careerSaveStatus === 'saved' ? notice : '';
  if (!ready) return <Page><Body>Loading tasks…</Body></Page>;
  const completed = state.tasks.filter((task) => task.status === 'completed').length;
  const open = state.tasks.length - completed;

  const saveTask = () => {
    if (title.trim().length < 3) return;
    addTask(title);
    setTitle('');
    setModal(false);
    setNotice('Task saved on this phone.');
  };
  const updateTaskAndNotify = (id: string, patch: Parameters<typeof updateTask>[1]) => {
    updateTask(id, patch);
    setNotice('Task updated and saved on this phone.');
  };

  return (
    <>
      <Page>
        <Header title="Task board" subtitle="Small, concrete actions that move your career forward." />
        {successToast ? <Text accessibilityLiveRegion="polite" style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{successToast}</Text> : null}
        <Button onPress={() => setModal(true)}>+ New task</Button>
        <View style={{ alignSelf: 'flex-start', backgroundColor: C.mintSoft, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 }}>
          <Text style={{ color: C.green, fontSize: 12, fontWeight: '800' }}>{completed} completed · {open} open</Text>
        </View>
        {state.tasks.map((task) => (
          <Card key={task.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 9, height: 9, borderRadius: 8, backgroundColor: task.priority === 'high' ? C.gold : task.priority === 'medium' ? C.violet : C.mint }} />
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }}>{task.priority}</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginLeft: 'auto' }}>{taskStatusLabel(task.status)}</Text>
            </View>
            <Text style={{ color: C.ink, fontSize: 17, fontWeight: '900' }}>{task.title}</Text>
            {task.notes ? <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>{task.notes}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button secondary onPress={() => updateTaskAndNotify(task.id, { status: task.status === 'completed' ? 'todo' : 'completed' })}>{task.status === 'completed' ? 'Reopen' : 'Complete'}</Button>
              <Button secondary onPress={() => updateTaskAndNotify(task.id, { status: task.status === 'todo' || task.status === 'backlog' ? 'inProgress' : task.status === 'inProgress' ? 'waiting' : 'todo' })}>Move</Button>
            </View>
          </Card>
        ))}
      </Page>
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,32,43,.42)' }}>
          <View style={{ backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 13 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>Add a task</Text>
            <Text style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>Task title</Text>
            <TextInput autoFocus value={title} onChangeText={setTitle} placeholder="What needs to move forward?" placeholderTextColor={C.muted} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, backgroundColor: '#ffffff', minHeight: 46 }} />
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Button secondary onPress={() => setModal(false)}>Cancel</Button>
              <Button onPress={saveTask}>Save task</Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
