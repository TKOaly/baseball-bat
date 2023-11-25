import { useDialog } from './dialog';
import { GlobalSearchDialog } from './dialogs/global-search-dialog';
import 'react-popper-tooltip/dist/styles.css';
import { usePopperTooltip } from 'react-popper-tooltip';
import { useFetchResourceDetails } from '../hooks/use-fetch-resource-details';
import { ResourceLink } from './resource-link';

export type Props = {
  type?: string;
  value?: { type: string; id: string } | string;
  name?: string;
  onChange?: (
    evt: { target: { value: { type: string; id: string }; name?: string } },
    resource: { type: string; id: string },
  ) => void;
};

export const ResourceSelectField = (props: Props) => {
  const showSearchDialog = useDialog(GlobalSearchDialog);
  const selected =
    props.type && typeof props.value === 'string'
      ? { type: props.type, id: props.value }
      : props.value;
  const {
    visible,
    getTooltipProps,
    getArrowProps,
    setTriggerRef,
    setTooltipRef,
  } = usePopperTooltip({
    interactive: true,
    followCursor: false,
    placement: 'top',
    delayShow: 300,
    offset: [0, 0],
  });
  const resourceDetails = useFetchResourceDetails(
    selected?.type,
    selected?.id,
    !selected,
  );

  const handleOpen = async () => {
    const result = await showSearchDialog({
      type: props.type,
      title: props.type
        ? `Select a ${props.type.replace('_', ' ')}`
        : 'Select a resource',
    });

    if (result !== null) {
      props?.onChange?.(
        { target: { value: result, name: props.name } },
        result,
      );
    }
  };

  return (
    <div>
      <div
        ref={setTriggerRef}
        className="bg-white mt-1 cursor-pointer flex items-center px-2 w-full border rounded-md shadow-sm inline-block border-gray-200"
        style={{ height: '42px' }}
        onClick={() => handleOpen()}
      >
        {selected && (
          <>
            <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize whitespace-nowrap">
              {selected.type.replace(/_/g, ' ')}
            </span>
            <span>{resourceDetails?.name}</span>
          </>
        )}
        {!selected && (
          <span className="text-gray-700">
            {props.type
              ? `Select a ${props.type.replace('_', ' ')}...`
              : 'Select a resource...'}
          </span>
        )}
      </div>
      {visible && selected && resourceDetails && (
        <div ref={setTooltipRef} {...getTooltipProps({ className: 'py-1' })}>
          <div className="rounded-md border border-gray-200 shadow-md bg-white z-10 p-2">
            <table className="text-sm">
              <tr>
                <td colSpan={2}>
                  <div className="flex items-center mb-2">
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-2 capitalize">
                      {resourceDetails.type.replace(/_/g, ' ')}
                    </span>
                    <span>{resourceDetails.name}</span>
                  </div>
                </td>
              </tr>
              {(resourceDetails.details ?? []).map(([label, details]) => {
                let value = null;

                if (details.type === 'text') {
                  value = details.value;
                } else if (details.type === 'resource') {
                  value = (
                    <ResourceLink type={details.resourceType} id={details.id} />
                  );
                }

                return (
                  <tr key={label}>
                    <th className="text-left text-gray-700 pr-2">{label}</th>
                    <td>{value}</td>
                  </tr>
                );
              })}
            </table>
          </div>
          <div {...getArrowProps()}>
            <div
              className="w-2 h-2 bg-white absolute border-r border-b border-gray-200"
              style={{
                marginTop: '-1px',
                transform: 'rotate(45deg) translate(-50%, 0%)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
