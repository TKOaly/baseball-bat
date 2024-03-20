import { Button } from '@bbat/ui/src/button';
import {
  useCreateTestDebtMutation,
  useCreditAllDebtsMutation,
} from '../../api/testing';

const TestControls = () => {
  const [createDebt] = useCreateTestDebtMutation();
  const [creditAllDebts] = useCreditAllDebtsMutation();

  return (
    <div className="rounded-md bg-white/90 p-8 shadow-xl">
      <h3 className="mb-5 font-bold text-zinc-800">Test Controls</h3>
      <div className="flex gap-3">
        <Button onClick={() => createDebt()}>Create test debt</Button>
        <Button onClick={() => creditAllDebts()}>Credit all debts</Button>
      </div>
    </div>
  );
};

export default TestControls;
