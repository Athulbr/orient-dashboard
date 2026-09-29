const convertDateFormat = (date: string) => {
  const convertedDate = new Date(date).toLocaleString("en-GB", { day: "numeric", month: "numeric", year: "numeric" });
  return convertedDate;
};
export default convertDateFormat;


export const convertToIst = (utcTimestamp: string) => {
  const utcDate = new Date(utcTimestamp);
  // IST is UTC + 5:30 => 330 minutes
  // const istOffsetInMinutes = 330;
  // const istTime = new Date(utcDate.getTime() + istOffsetInMinutes * 60000);

  const istTime = new Date(utcDate.getTime());

  const day = String(istTime.getDate()).padStart(2, '0');
  const month = String(istTime.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = istTime.getFullYear();

  const hours = String(istTime.getHours()).padStart(2, '0');
  const minutes = String(istTime.getMinutes()).padStart(2, '0');
  const seconds = String(istTime.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export const getCurrentDateTime = () => {
  const istTime = new Date();
  const day = String(istTime.getDate()).padStart(2, '0');
  const month = String(istTime.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = istTime.getFullYear();

  const hours = String(istTime.getHours()).padStart(2, '0');
  const minutes = String(istTime.getMinutes()).padStart(2, '0');
  const seconds = String(istTime.getSeconds()).padStart(2, '0');

  return `${day}-${month}-${year}_${hours}:${minutes}:${seconds}`;
}