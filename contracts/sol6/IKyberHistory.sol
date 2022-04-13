pragma solidity 0.6.6;


interface INimbleHistory {
    function saveContract(address _contract) external;
    function getContracts() external view returns (address[] memory);
}
