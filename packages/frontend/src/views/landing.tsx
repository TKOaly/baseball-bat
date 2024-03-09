import { useLocation } from 'wouter';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { BACKEND_URL } from '../config';

export const Landing = () => {
  const [, setLocation] = useLocation();

  return (
    <>
      <h3 className="mb-5 text-xl font-bold text-gray-500">Authenticate</h3>
      <p>
        Authentication is required in order to view your personal payment
        information. Choose a method of authentication from the list below:
      </p>
      <ul className="mx-auto my-10 flex w-80 flex-col gap-3">
        <li className="">
          <Button
            className="w-full bg-yellow-300 text-black shadow hover:bg-yellow-400"
            onClick={() =>
              window.location.replace(`${BACKEND_URL}/api/session/login`)
            }
            data-cy="login-member-account-button"
          >
            TKO-äly Member Account
          </Button>
        </li>
        <li className="">
          <SecondaryButton
            className="w-full"
            onClick={() => setLocation('/auth/email')}
          >
            Email
          </SecondaryButton>
        </li>
      </ul>
    </>
  );
};
