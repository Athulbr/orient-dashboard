import { FC, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../../../components/Button';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { ButtonBox } from '../../../../../components/ButtonBox';
import { useViewRecordApi } from '../hooks/useViewRecordApi';
import { Trash2 } from 'lucide-react';

interface CommentDialogPropsIF {
    closeDialog: () => void;
    isOpen: boolean;
    jsonKey: string;
    commentList: { text: string; date: string; time: string }[];
    setCommentList: (commentList: { text: string; date: string; time: string }[]) => void;
}

export const CommentDialog: FC<CommentDialogPropsIF> = ({ isOpen, closeDialog, jsonKey, commentList, setCommentList }) => {
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    const toast = useToastStore();
    const dialogRef = useRef<HTMLDivElement>(null);

    const { createComment } = useViewRecordApi();

    // Memoize the click outside handler to prevent recreation on every render
    const handleClickOutside = useCallback(
        (event: MouseEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
                setComment('');
                closeDialog();
            }
        },
        [closeDialog]
    );

    useEffect(() => {
        if (!isOpen) return;

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, handleClickOutside]);

    // Memoize the click handler to prevent recreation on every render
    const onClickHandler = useCallback(async () => {
        if (!`${comment}`?.trim()) return;
        setLoading(true);
        const res = await createComment(comment, jsonKey);
        if (res) {
            setLoading(false);
            setComment('');
            closeDialog();
        }
    }, [comment, createComment, closeDialog, jsonKey]);

    // Memoize the textarea change handler
    const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setComment(e.target.value);
    }, []);

    // Memoize the close handler (in case it's not already memoized in parent)
    const handleClose = useCallback(() => {
        closeDialog();
        setComment('');
    }, [closeDialog]);

    // Memoize computed values
    const isCommentEmpty = useMemo(() => !`${comment}`?.trim(), [comment]);
    const buttonText = useMemo(() => (loading ? 'Saving...' : 'Save'), [loading]);

    const saveComment = () => {
        setCommentList([...commentList, { text: comment, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString() }]);
        setComment('');
        handleClose();
    };
    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            className="absolute top-0 right-2 z-10 flex w-[calc(100%-10px)]  flex-col items-end gap-2 rounded-lg border bg-white px-4 py-2 text-lg shadow-xl"
        >
            <header className="w-full font-bold text-gray-600">Add Comment</header>
            <textarea
                value={comment}
                onChange={handleCommentChange}
                className="w-full rounded-lg border p-2 text-sm text-gray-700 focus:outline-1"
                rows={2}
                placeholder="Add your comment here..."
            />
            <ButtonBox>
                <Button onClick={handleClose} small outlined>
                    Close
                </Button>
                <Button onClick={saveComment} disabled={isCommentEmpty} small className="w-fit" outlined>
                    {buttonText}
                </Button>
            </ButtonBox>

            <div className="mt-2 w-full flex flex-col gap-3 pb-2">
                {commentList.map((item, index) => (
                    <div
                        key={index}
                        className="relative  pt-8 text-sm border p-3 text-gray-600 rounded-md bg-gray-100 capitalize flex items-center justify-between"
                    >
                        <div className="text-sm">{item.text}</div>
                        <span className="text-xs text-gray-400 min-w-30 absolute top-1 right-1">
                            {item.date} : {item.time}
                        </span>
                        <span
                            onClick={() => setCommentList(commentList.filter((_, i) => i !== index))}
                            className="text-xs p-1 text-gray-400 cursor-pointer hover:text-gray-700"
                        >
                            <Trash2 size={16} />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
