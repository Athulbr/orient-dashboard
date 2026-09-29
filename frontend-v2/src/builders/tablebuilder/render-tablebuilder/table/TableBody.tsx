import React, { FC, JSX, ReactNode, useCallback, useEffect } from 'react';
import { useTablebuilderState } from '../hooks/useTablebuilderStateContext';
import { dataMapper } from '../utils/DataMapper';
import { Edit, Trash, Trash2 } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import { useAlertStore } from '../../../../components/alert/AlertStore';
import Tooltip from '../../../../components/Tooltip';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';

export const TableBody: FC = () => {
    const { injectedData, settings, state, setState } = useTablebuilderState();
    const { checkPermission } = usePermissionStore();

    const { customFunctions, customUI, onRowSelect } = injectedData;

    const { columns, rowSelection, api } = settings;
    const { data, selectedIds, loading } = state;

    useEffect(() => {
        if (api.refresh === 1) return;
        // clearActiveFilters(); todo
    }, [api.refresh]);

    const selectable = rowSelection.showRowSelection;

    const getCustomUI = useCallback(
        (customUiKey: string, data: any): ReactNode => {
            const Test = customUI[customUiKey];
            return Test ? <Test data={data} /> : null;
        },
        [customUI]
    );

    const rowClickHandler = (e: React.MouseEvent<HTMLTableRowElement>, row: Record<string, string>) => {
        e.stopPropagation();
        if (customFunctions['rowClickHandler']) {
            customFunctions['rowClickHandler'](row, data);
        }
    };
    const rowCheckHandler = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
        e.stopPropagation();
        if (onRowSelect) {
            onRowSelect(e.target.checked ? [...selectedIds, id] : selectedIds.filter(selectedId => selectedId !== id));
        }
        setState({ ...state, selectedIds: e.target.checked ? [...selectedIds, id] : selectedIds.filter(selectedId => selectedId !== id) });
    };

    return (
        <tbody className="divide-y divide-gray-200 border-b-[1px] border-b-gray-200">
            {data.map((row: any, index: number) => {
                return (
                    <tr
                        onClick={e => rowClickHandler(e, row)}
                        key={index}
                        className={selectedIds.includes(row._id) && rowSelection.enableRowHighlight ? 'bg-blue-50' : ''}
                    >
                        {selectable && (
                            <td onClick={e => e.stopPropagation()} className="px-5 py-4 whitespace-nowrap">
                                <input
                                    type="checkbox"
                                    className="cursor-pointer rounded border-gray-300 p-0 text-blue-600 focus:ring-blue-500"
                                    checked={selectedIds.includes(row._id)}
                                    onChange={e => rowCheckHandler(e, row._id)} // handleSelectRow(row._id, e.target.checked); todo
                                />
                            </td>
                        )}
                        {columns.map((column, index) => {
                            if (column.hidden) return null;
                            if (
                                column.header === 'Actions' &&
                                !checkPermission(injectedData.updatePermission) &&
                                !checkPermission(injectedData.deletePermission)
                            )
                                return null;
                            if (injectedData?.hiddenColumns?.includes(column.key)) return null;

                            return (
                                <td key={index + 5} className="px-2 py-4 xl:px-5">
                                    <div
                                        title={row[column.key]}
                                        className={`w-fit max-w-[300px] min-w-[80px] truncate text-xs whitespace-nowrap text-gray-800 lg:text-sm ${column.capitalize ? 'capitalize' : ''} ${false ? "relative animate-pulse after:absolute after:top-0 after:left-0 after:w-full after:rounded-sm after:bg-gray-200 after:text-gray-200 after:content-['.']" : ''} `}
                                    >
                                        {column.dateUI ? (
                                            <div>{formatDate(row[column.key])}</div>
                                        ) : column.editButton || column.deleteButton ? (
                                            <ActionButtons settings={column} row={row} />
                                        ) : column.customUI ? (
                                            getCustomUI(column.customUiKey, row)
                                        ) : (
                                            (dataMapper(row, column.key.split(',')) as React.ReactNode)
                                        )}
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                );
            })}
        </tbody>
    );
};

interface ActionButtonsIF {
    settings: {
        key: string;
        header: string;
        sortable: boolean;
        customUI: boolean;
        customUiKey: string;
        capitalize: boolean;
        hidden: boolean;
        editButton: boolean;
        deleteButton: boolean;
        editUrl: string;
        deleteUrl: string;
    };
    row: any;
}

const ActionButtons: React.FC<ActionButtonsIF> = ({ settings, row }) => {
    const { injectedData, setState, state } = useTablebuilderState();
    const { checkPermission } = usePermissionStore();
    const { customFunctions } = injectedData;
    const alert = useAlertStore();

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (customFunctions['editClickHandler']) {
            customFunctions['editClickHandler'](row);
        }
    };
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();

        alert.showAlert({
            alertText: 'Are you sure you want to delete this?',
            primaryButtonText: 'Delete',
            onPrimaryAction: () => {
                if (customFunctions['deleteClickHandler']) {
                    customFunctions['deleteClickHandler'](row);
                }
                alert.closeAlert();
            }
        });
    };

    return (
        <div className={`ml-2 flex gap-4 ${settings.editButton ? 'ml-2' : 'ml-6'}`}>
            {settings.editButton && checkPermission(injectedData.updatePermission) && (
                <Tooltip text="Edit" position="bottom">
                    <Edit onClick={handleEdit} className="cursor-pointer hover:text-blue-500" size={18} />
                </Tooltip>
            )}
            {settings.deleteButton && checkPermission(injectedData.deletePermission) && (
                <Tooltip text="Delete" position="bottom">
                    <Trash2 onClick={handleDelete} className="cursor-pointer hover:text-red-500" size={18} />
                </Tooltip>
            )}
        </div>
    );
};

export default ActionButtons;
