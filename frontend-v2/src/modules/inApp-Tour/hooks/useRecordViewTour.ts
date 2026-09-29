import { useCallback } from 'react';
import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/useProductTour.css';
import { getTourState, setTourState, isUserLoggedIn, setAllToursComplete, isTourEnabled } from './tourStorage';

export const useRecordViewTour = () => {
    const startTour = useCallback(() => {
        if (!isUserLoggedIn() || !isTourEnabled()) {
            return;
        }
        
        // Check if product tour and record list tour are completed
        const productTourShown = getTourState('productTourShown');
        const recordListTourShown = getTourState('recordListTourShown');
        const reviewButtonTourShown = getTourState('reviewButtonTourShown');
        const recordViewTourShown = getTourState('recordViewTourShown');

        if (!productTourShown || !recordListTourShown || recordViewTourShown) {
            return;
        }

        // Phase 1: Show review button tour on list page
        const startReviewButtonTour = () => {
            if (reviewButtonTourShown) {
                return false;
            }

            // Add delay to ensure DOM is ready for new users
            setTimeout(() => {
                const reviewButton = document.querySelector('[data-tour-id="review-button"]');
                
                if (!reviewButton) {
                    return;
                }

                const driverObj = driver({
                    showProgress: false,
                    showButtons: ['next', 'previous', 'close'],
                    allowClose: false,
                    steps: [
                        {
                            element: '[data-tour-id="first-review-button"]',
                            popover: {
                                title: 'Review Status',
                                description: 'This shows the record is ready for review. Click on this row to open the record details and review the extracted data.',
                                side: 'bottom',
                                align: 'center',
                                onNextClick: () => {
                                    setTourState('reviewButtonTourShown', true);
                                    const reviewBtn = document.querySelector('[data-tour-id="review-button"]') as HTMLElement;
                                    if (reviewBtn) {
                                        const row = reviewBtn.closest('tr') as HTMLElement;
                                        if (row) {
                                            row.click();
                                        }
                                    }
                                    driverObj.destroy();
                                }
                            }
                        } as DriveStep
                    ],
                    onDestroyed: () => {
                        setTourState('reviewButtonTourShown', true);
                        
                        // Close the extraction floating window
                        const closeButton = document.querySelector('[data-tour-id="extraction-close-button"]');
                        if (closeButton) {
                            // Dispatch click event for SVG element
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            closeButton.dispatchEvent(clickEvent);
                        }
                    },
                    onDestroyStarted: () => {
                        setAllToursComplete();
                        driverObj.destroy();
                    }
                });

                driverObj.drive();
            }, 1000);

            return true;
        };

        // Phase 2: Show record view tour on record detail page
        const startRecordDetailTour = () => {
            if (!reviewButtonTourShown) {
                return false;
            }

            const firstInputField = document.querySelector('[data-tour-id="first-input-field"]');

            if (!firstInputField) {
                return false;
            }

            // Build the tour steps
            const steps: DriveStep[] = [
                {
                    element: '[data-tour-id="first-input-field"]',
                    popover: {
                        title: 'Edit Extracted Data',
                        description:
                            'Here you can review and edit the data extracted from your document. Each field shows the extracted value with a confidence score. You can modify values, regenerate fields using AI, or validate them against external sources.',
                        side: 'left',
                        align: 'start'
                    }
                }
            ];

            // Add export button step
            const exportButton = document.querySelector('[data-tour-id="export-button"]');
            if (exportButton) {
                steps.push({
                    element: '[data-tour-id="export-button"]',
                    popover: {
                        title: 'Export Data',
                        description: 'Export your extracted data in JSON or XLSX format. This allows you to use the data in other applications or share it with others.',
                        side: 'bottom',
                        align: 'center'
                    }
                } as DriveStep);
            }

            // Add skip to next document button step
            const skipButton = document.querySelector('[data-tour-id="skip-next-document-button"]');
            if (skipButton) {
                steps.push({
                    element: '[data-tour-id="skip-next-document-button"]',
                    popover: {
                        title: 'Skip to Next Document',
                        description: 'Quickly navigate to the next document in your batch without saving changes to the current one.',
                        side: 'top',
                        align: 'center'
                    }
                } as DriveStep);
            }

            // Add re-extract button step if available
            const reExtractButton = document.querySelector('[data-tour-id="re-extract-button"]');
            if (reExtractButton) {
                steps.push({
                    element: '[data-tour-id="re-extract-button"]',
                    popover: {
                        title: 'Re-Extract Document',
                        description: 'Re-run the extraction process on this document. Use this if the initial extraction needs improvement or if you want to try again.',
                        side: 'top',
                        align: 'center'
                    }
                } as DriveStep);
            }

            // Add save button step
            const saveButton = document.querySelector('[data-tour-id="save-updated-data-button"]');
            if (saveButton) {
                steps.push({
                    element: '[data-tour-id="save-updated-data-button"]',
                    popover: {
                        title: 'Save Updated Data',
                        description: 'Save your changes without submitting. You can come back later to continue editing this record.',
                        side: 'top',
                        align: 'center'
                    }
                } as DriveStep);
            }

            // Add submit button step
            const submitButton = document.querySelector('[data-tour-id="submit-button"]');
            if (submitButton) {
                steps.push({
                    element: '[data-tour-id="submit-button"]',
                    popover: {
                        title: 'Submit Record',
                        description: 'Finalize and submit this record. Once submitted, the record will be marked as complete and ready for further processing.',
                        side: 'top',
                        align: 'center'
                    }
                } as DriveStep);
            }

            const driverObj = driver({
                showProgress: true,
                showButtons: ['next', 'previous', 'close'],
                allowClose: false,
                steps: steps as DriveStep[],
                onDestroyed: () => {
                    setTourState('recordViewTourShown', true);
                    
                    // Click and focus on the input element inside the first InputField
                    setTimeout(() => {
                        const inputFieldContainer = document.querySelector('[data-tour-id="first-input-field"]');
                        if (inputFieldContainer) {
                            const inputElement = inputFieldContainer.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
                            if (inputElement) {
                                inputElement.click();
                                inputElement.focus();
                                // Select the text for easy editing
                                if (inputElement.select) {
                                    inputElement.select();
                                }
                            }
                        }
                    }, 300);
                },
                onDestroyStarted: () => {
                    setAllToursComplete();
                    driverObj.destroy();
                }
            });

            driverObj.drive();
            return true;
        };

        // Determine which phase to show
        if (!reviewButtonTourShown) {
            // Phase 1: Show review button tour on list page
            startReviewButtonTour();
        } else if (reviewButtonTourShown && !recordViewTourShown) {
            // Phase 2: Show record detail tour
            startRecordDetailTour();
        }
    }, []);

    return startTour;
};
