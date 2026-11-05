export type CareerSaveStatus = 'saved' | 'saving' | 'failed';

export type LocalSaveCoordinator<Career, Workspace> = {
  markPending: () => void;
  persist: (career: Career, workspace: Workspace) => Promise<boolean>;
};

export function createLocalSaveCoordinator<Career, Workspace>(
  saveLocalState: (career: Career, workspace: Workspace) => Promise<void>,
  setStatus: (status: CareerSaveStatus) => void,
): LocalSaveCoordinator<Career, Workspace> {
  let generation = 0;
  let writeTail: Promise<void> = Promise.resolve();

  return {
    markPending() {
      generation += 1;
      setStatus('saving');
    },
    async persist(career, workspace) {
      const request = ++generation;
      setStatus('saving');
      const result = writeTail.then(() => Promise.resolve().then(() => saveLocalState(career, workspace)));
      writeTail = result.then(() => undefined, () => undefined);
      const saved = await result.then(() => true, () => false);
      if (request !== generation) return false;
      setStatus(saved ? 'saved' : 'failed');
      return saved;
    },
  };
}

export function careerSaveNotice(status: CareerSaveStatus, successNotice = ''): string {
  if (status === 'saving') return 'Saving changes to this phone…';
  if (status === 'failed') {
    return 'Not saved to this phone. These changes are visible only in the current session and may be lost if you close the app. Check device storage, then retry saving.';
  }
  return successNotice;
}
