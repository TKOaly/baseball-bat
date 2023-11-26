import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
  useDialog,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';
import { ResourceSelectField } from '../resource-select-field';
import { InternalIdentity } from '@bbat/common/src/types';
import { useState } from 'react';
import { useMergeProfilesMutation } from '../../api/payers';
import { ErrorDialog } from './error-dialog';

export type Props = {
  primaryId?: InternalIdentity;
  secondaryId?: InternalIdentity;
  onClose: (_: { primaryId: string; secondaryId: string } | null) => void;
};

export const MergeProfilesDialog = (props: Props) => {
  const [primaryId, setPrimaryId] = useState(props.primaryId?.value);
  const [secondaryId, setSecondaryId] = useState(props.secondaryId?.value);
  const [mergeProfiles, { isLoading }] = useMergeProfilesMutation();
  const showErrorDialog = useDialog(ErrorDialog);

  const handleMerge = async () => {
    if (!primaryId || !secondaryId) {
      return;
    }

    const result = await mergeProfiles({
      primaryPayerId: primaryId,
      secondaryPayerId: secondaryId,
    });

    if ('data' in result) {
      props.onClose({
        primaryId,
        secondaryId,
      });
    } else {
      showErrorDialog({
        title: 'Failed to merge profiles',
        content: 'Could not merge the selected profiles.',
      });
    }
  };

  return (
    <DialogBase onClose={() => props.onClose(null)}>
      <DialogHeader>Merge payer profiles</DialogHeader>
      <DialogContent>
        <table>
          <tr>
            <th className="text-left pr-3">Merge from</th>
            <td>
              <ResourceSelectField
                type="payer"
                value={secondaryId}
                onChange={evt => setSecondaryId(evt.target.value.id)}
              />
            </td>
          </tr>
          <tr>
            <th className="text-left pr-3">Merge to</th>
            <td>
              <ResourceSelectField
                type="payer"
                value={primaryId}
                onChange={evt => setPrimaryId(evt.target.value.id)}
              />
            </td>
          </tr>
        </table>
        <Button
          onClick={() => {
            setPrimaryId(secondaryId);
            setSecondaryId(primaryId);
          }}
        >
          Swap
        </Button>
      </DialogContent>
      <DialogFooter>
        <Button secondary onClick={() => props.onClose(null)}>
          Close
        </Button>
        <Button
          disabled={!primaryId || !secondaryId}
          onClick={handleMerge}
          loading={isLoading}
        >
          Merge
        </Button>
      </DialogFooter>
    </DialogBase>
  );
};
