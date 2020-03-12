pragma solidity 0.5.11;

import "./AssertBytes.sol";
import "./truffle/Assert.sol";
import "../../../contractsSol5/utils/BytesLib.sol";


contract TestBytesLib1 {
    using BytesLib for bytes;

    bytes storageCheckBytes = hex"aabbccddeeff";
    bytes storageCheckBytesZeroLength = hex"";

    event LogBytes(bytes loggedBytes);

    /**
    * Sanity Checks
    */

    function testSanityCheck() public {
        // Assert library sanity checks
        //
        // Please don't change the ordering of the var definitions
        // the order is purposeful for testing zero-length arrays
        bytes memory checkBytes = hex"aabbccddeeff";
        bytes memory checkBytesZeroLength = hex"";

        bytes memory checkBytesRight = hex"aabbccddeeff";
        bytes memory checkBytesZeroLengthRight = hex"";
        bytes memory checkBytesWrongLength = hex"aa0000";
        bytes memory checkBytesWrongContent = hex"aabbccddee00";

        // This next line is needed in order for Truffle to activate the Solidity unit testing feature
        // otherwise it doesn't interpret any events fired as results of tests
        Assert.equal(uint256(1), uint256(1), "This should not fail! :D");

        AssertBytes.equal(checkBytes, checkBytesRight, "Sanity check should be checking equal bytes arrays out.");
        AssertBytes.notEqual(checkBytes, checkBytesWrongLength, "Sanity check should be checking different length bytes arrays out.");
        AssertBytes.notEqual(checkBytes, checkBytesWrongContent, "Sanity check should be checking different content bytes arrays out.");

        AssertBytes.equalStorage(storageCheckBytes, checkBytesRight, "Sanity check should be checking equal bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytes, checkBytesWrongLength, "Sanity check should be checking different length bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytes, checkBytesWrongContent, "Sanity check should be checking different content bytes arrays out. (Storage)");

        // Zero-length checks
        AssertBytes.equal(checkBytesZeroLength, checkBytesZeroLengthRight, "Sanity check should be checking equal zero-length bytes arrays out.");
        AssertBytes.notEqual(checkBytesZeroLength, checkBytes, "Sanity check should be checking different length bytes arrays out.");

        AssertBytes.equalStorage(storageCheckBytesZeroLength, checkBytesZeroLengthRight, "Sanity check should be checking equal zero-length bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytesZeroLength, checkBytes, "Sanity check should be checking different length bytes arrays out. (Storage)");
    }

    /**
    * Memory Integrity Checks
    */

    function testMemoryIntegrityCheck4Bytes() public {
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory postBytes4 = hex"f00dfeed";
        bytes memory postBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes4);

        // Now we should make sure that all the other previously initialized arrays stayed the same
        testBytes = hex"f00dfeed";
        AssertBytes.equal(preBytes4, testBytes, "After a postBytes4 concat the preBytes4 integrity check failed.");
        AssertBytes.equal(postBytes4, testBytes, "After a postBytes4 concat the postBytes4 integrity check failed.");
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes31, testBytes, "After a postBytes4 concat the postBytes31 integrity check failed.");
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes32, testBytes, "After a postBytes4 concat the postBytes32 integrity check failed.");
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes33, testBytes, "After a postBytes4 concat the postBytes33 integrity check failed.");
    }

    function testMemoryIntegrityCheck31Bytes() public {
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory postBytes4 = hex"f00dfeed";
        bytes memory postBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes31);

        // Now we should make sure that all the other previously initialized arrays stayed the same
        testBytes = hex"f00dfeed";
        AssertBytes.equal(preBytes4, testBytes, "After a postBytes31 concat the preBytes4 integrity check failed.");
        AssertBytes.equal(postBytes4, testBytes, "After a postBytes31 concat the postBytes4 integrity check failed.");
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes31, testBytes, "After a postBytes31 concat the postBytes31 integrity check failed.");
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes32, testBytes, "After a postBytes31 concat the postBytes32 integrity check failed.");
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes33, testBytes, "After a postBytes31 concat the postBytes33 integrity check failed.");
    }

    function testMemoryIntegrityCheck32Bytes() public {
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory postBytes4 = hex"f00dfeed";
        bytes memory postBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes32);

        // Now we should make sure that all the other previously initialized arrays stayed the same
        testBytes = hex"f00dfeed";
        AssertBytes.equal(preBytes4, testBytes, "After a postBytes32 concat the preBytes4 integrity check failed.");
        AssertBytes.equal(postBytes4, testBytes, "After a postBytes32 concat the postBytes4 integrity check failed.");
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes31, testBytes, "After a postBytes32 concat the postBytes31 integrity check failed.");
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes32, testBytes, "After a postBytes32 concat the postBytes32 integrity check failed.");
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes33, testBytes, "After a postBytes32 concat the postBytes33 integrity check failed.");
    }

    function testMemoryIntegrityCheck33Bytes() public {
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory postBytes4 = hex"f00dfeed";
        bytes memory postBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory postBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes33);

        // Now we should make sure that all the other previously initialized arrays stayed the same
        testBytes = hex"f00dfeed";
        AssertBytes.equal(preBytes4, testBytes, "After a postBytes33 concat the preBytes4 integrity check failed.");
        AssertBytes.equal(postBytes4, testBytes, "After a postBytes33 concat the postBytes4 integrity check failed.");
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes31, testBytes, "After a postBytes33 concat the postBytes31 integrity check failed.");
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes32, testBytes, "After a postBytes33 concat the postBytes32 integrity check failed.");
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(postBytes33, testBytes, "After a postBytes33 concat the postBytes33 integrity check failed.");
    }

    /**
    * Memory Concatenation Tests
    */

    function testConcatMemory4Bytes() public {
        // Initialize `bytes` variables in memory with different critical sizes
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory preBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory postBytes4 = hex"f00dfeed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes4);
        testBytes = hex"f00dfeedf00dfeed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes4 + postBytes4 concatenation failed.");

        resultBytes = preBytes31.concat(postBytes4);
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feedf00dfeed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes31 + postBytes4 concatenation failed.");

        resultBytes = preBytes32.concat(postBytes4);
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feedf00dfeed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes32 + postBytes4 concatenation failed.");

        resultBytes = preBytes33.concat(postBytes4);
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00dfeed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes33 + postBytes4 concatenation failed.");
    }

    function testConcatMemory31Bytes() public {
        // Initialize `bytes` variables in memory with different critical sizes
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory preBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory postBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes31);
        testBytes = hex"f00dfeedf00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes4 + postBytes31 concatenation failed.");

        resultBytes = preBytes31.concat(postBytes31);
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feedf00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes31 + postBytes31 concatenation failed.");

        resultBytes = preBytes32.concat(postBytes31);
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feedf00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes32 + postBytes31 concatenation failed.");

        resultBytes = preBytes33.concat(postBytes31);
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00d000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes33 + postBytes31 concatenation failed.");
    }

    function testConcatMemory32Bytes() public {
        // Initialize `bytes` variables in memory with different critical sizes
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory preBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory postBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes32);
        testBytes = hex"f00dfeedf00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes4 + postBytes32 concatenation failed.");

        resultBytes = preBytes31.concat(postBytes32);
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feedf00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes31 + postBytes32 concatenation failed.");

        resultBytes = preBytes32.concat(postBytes32);
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feedf00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes32 + postBytes32 concatenation failed.");

        resultBytes = preBytes33.concat(postBytes32);
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00d00000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes33 + postBytes32 concatenation failed.");
    }

    function testConcatMemory33Bytes() public {
        // Initialize `bytes` variables in memory with different critical sizes
        bytes memory preBytes4 = hex"f00dfeed";
        bytes memory preBytes31 = hex"f00d000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes32 = hex"f00d00000000000000000000000000000000000000000000000000000000feed";
        bytes memory preBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        // And another set of the same to concatenate with
         bytes memory postBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        resultBytes = preBytes4.concat(postBytes33);
        testBytes = hex"f00dfeedf00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes4 + postBytes33 concatenation failed.");

        resultBytes = preBytes31.concat(postBytes33);
        testBytes = hex"f00d000000000000000000000000000000000000000000000000000000feedf00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes31 + postBytes33 concatenation failed.");

        resultBytes = preBytes32.concat(postBytes33);
        testBytes = hex"f00d00000000000000000000000000000000000000000000000000000000feedf00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes32 + postBytes33 concatenation failed.");

        resultBytes = preBytes33.concat(postBytes33);
        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00d0000000000000000000000000000000000000000000000000000000000feed";
        AssertBytes.equal(resultBytes, testBytes, "preBytes33 + postBytes33 concatenation failed.");
    }
}
