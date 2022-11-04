import { useLocation } from 'wouter';
import { SecondaryButton } from '../../components/button';

export const Tools = () => {
  const [, setLocation] = useLocation();

  return (
    <div>
      <h1 className="text-2xl mb-5 mt-10">Tools</h1>
      <div>
        <SecondaryButton onClick={() => setLocation('/admin/tools/import-xml-statement')}>Import payments from XML bank statement</SecondaryButton>
      </div>
    </div>
  );
};
