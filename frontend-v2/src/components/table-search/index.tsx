import style from './table-search.module.css';
import searchIconImage from '../../assets/images/search.png';

interface PropsIF {
  searchText: string | undefined;
  setSearchText: (value: string) => void; // Removed unnecessary parentheses
  setCurrentPage?: (value: number) => void;
}

const TableSearch: React.FC<PropsIF> = ({ searchText, setSearchText, setCurrentPage }) => {
  return (
    <div className={style.tableSearch}>
      <input
        placeholder="Search"
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value);
          if (setCurrentPage) setCurrentPage(1);
        }}
      />
      {/* <img src={searchIconImage} alt="Search Icon" /> */}
    </div>
  );
};

export default TableSearch;
