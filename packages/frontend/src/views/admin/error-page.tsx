import { Button } from '@bbat/ui/src/button';
import { useState } from 'react';
import { AlertCircle } from 'react-feather';

export const ErrorPage = ({ error }: { error?: Error }) => {
  const [isDetailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="relative w-[40em] rounded-lg border bg-white p-6 pl-8 shadow">
        <div className="absolute inset-y-0 left-0 my-[-1px] ml-[-1px] w-2 rounded-l-lg border-y border-l border-red-600 bg-red-500" />
        <h1 className="text-lg">
          <AlertCircle className="relative -top-0.5 mr-3 inline-block size-10 text-red-500 drop-shadow" />
          Something went wrong!
        </h1>
        <p className="mt-5">
          The application encountered an unexpected error. Please try again and
          contact the administration team if the problem persists.
        </p>
        {error && (
          <>
            <Button
              secondary
              className="mt-5"
              onClick={() => setDetailsOpen(!isDetailsOpen)}
            >
              {isDetailsOpen ? 'Hide details' : 'Show details'}
            </Button>
            {isDetailsOpen && (
              <pre className="mt-5 overflow-auto rounded-md border bg-gray-50 p-4 font-mono text-xs shadow">
                <strong>
                  {error.name}: {error.message}
                </strong>
                <br />
                <br />

                {error.stack}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
};
