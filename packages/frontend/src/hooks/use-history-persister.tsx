import { Persister } from '@bbat/ui/src/table';
import { produce } from 'immer';

export const useHistoryPersister = () => {
  return (name: string): Persister => ({
    load: () => {
      const state = history.state?.tables?.[name];
      console.log('LOAD', name, state);
      return state;
    },
    store: tableState =>
      history.replaceState(
        produce(history.state, (state: any) => {
          console.log('STORE', name, tableState);

          if (!state) {
            state = {};
          }

          if (!state.tables) {
            state.tables = {};
          }

          state.tables[name] = tableState;

          return state;
        }),
        '',
        '',
      ),
  });
};
