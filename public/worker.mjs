import { runTask } from './tasks.mjs';

self.onmessage = ({data}) => {
  const {id, task, payload} = data;
  try {
    self.postMessage({id, result:runTask(task,payload)});
  } catch (error) {
    self.postMessage({id, error:error instanceof Error ? error.message : String(error)});
  }
};
