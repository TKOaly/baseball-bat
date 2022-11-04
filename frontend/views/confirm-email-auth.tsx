import { Button, SecondaryButton } from '../components/button';

export const ConfirmEmailAuth = () => {
  return (
    <>
      <h1 className="text-xl font-bold text-gray-500">Authentication Successful</h1>

      <p className="mt-5 mb-7">
        Authentication was succesfull. You can begin a session in this browser or the one from which you initiated the authentication.
      </p>

      <ul className="flex flex-col gap-2 items-center">
        <li className="inline"><Button>Continue Here</Button></li>
        <li><SecondaryButton>Continue in Initial Browser</SecondaryButton></li>
      </ul>
    </>
  );
};
