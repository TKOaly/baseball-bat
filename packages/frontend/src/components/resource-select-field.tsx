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
  let selected: { type: string; id: string } | undefined;

  /*=
    props.type && typeof props.value === 'string'
      ? { type: props.type, id: props.value }
      : props.value;*/

  if (typeof props.value === 'string') {
    if (props.type) {
      selected = { id: props.value, type: props.type };
    } else {
      throw new Error('Invalid value');
    }
  } else {
    selected = props.value;
  }

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
    selected?.type ?? '',
    selected?.id ?? '',
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
        className="mt-1 inline-block flex w-full cursor-pointer items-center rounded-md border border-gray-200 bg-white px-2 shadow-sm"
        style={{ height: '42px' }}
        onClick={() => handleOpen()}
      >
        {selected && (
          <>
            <span className="mr-3 whitespace-nowrap rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
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
          <div className="z-10 rounded-md border border-gray-200 bg-white p-2 shadow-md">
            <table className="text-sm">
              <tr>
                <td colSpan={2}>
                  <div className="mb-2 flex items-center">
                    <span className="mr-2 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
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
                    <th className="pr-2 text-left text-gray-700">{label}</th>
                    <td>{value}</td>
                  </tr>
                );
              })}
            </table>
          </div>
          <div {...getArrowProps()}>
            <div
              className="absolute h-2 w-2 border-b border-r border-gray-200 bg-white"
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
