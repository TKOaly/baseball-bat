import { useLocation } from 'wouter';
import React from 'react';
import { Button, SecondaryButton } from '@bbat/ui/button';

export const Landing = () => {
  const [, setLocation] = useLocation();

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold mb-5">Authenticate</h3>
      <p>
        Authentication is required in order to view your personal payment
        information. Choose a method of authentication from the list below:
      </p>
      <ul className="flex flex-col gap-3 w-80 mx-auto my-10">
        <li className="">
          <Button
            className="bg-yellow-300 hover:bg-yellow-400 w-full text-black shadow"
            onClick={() =>
              window.location.replace(
                `${process.env.BACKEND_URL}/api/session/login`,
              )
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
