import { Button, SecondaryButton } from '@bbat/ui/button';

export const ConfirmEmailAuth = () => {
  return (
    <>
      <h1 className="text-xl font-bold text-gray-500">
        Authentication Successful
      </h1>

      <p className="mb-7 mt-5">
        Authentication was succesfull. You can begin a session in this browser
        or the one from which you initiated the authentication.
      </p>

      <ul className="flex flex-col items-center gap-2">
        <li className="inline">
          <Button>Continue Here</Button>
        </li>
        <li>
          <SecondaryButton>Continue in Initial Browser</SecondaryButton>
        </li>
      </ul>
    </>
  );
};
