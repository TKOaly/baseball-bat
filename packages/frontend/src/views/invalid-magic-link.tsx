import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@bbat/ui/button';

export const InvalidMagicLink = () => {
  const [, setLocation] = useLocation();

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold mb-5">Invalid Link</h3>
      <p>The link you used has expired or is invalid.</p>
      <ul className="flex flex-col gap-3 mx-auto my-5">
        <li className="">
          <Button onClick={() => setLocation('/')}>Go to front page</Button>
        </li>
      </ul>
    </>
  );
};
