(function () {
    "use strict";

    // Match the Main Menu's room sequence. Stable sorting preserves the
    // saved (including manually rearranged) patient order within each room.
    function sortByRoom(orders) {
        return (Array.isArray(orders) ? [...orders] : []).sort((a, b) => {
            const aRoom = String(a.roomNumber || "").trim();
            const bRoom = String(b.roomNumber || "").trim();
            const aNum = parseFloat(aRoom);
            const bNum = parseFloat(bRoom);

            if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
                return aNum - bNum;
            }

            return aRoom.localeCompare(bRoom, undefined, {
                numeric: true,
                sensitivity: "base"
            });
        });
    }

    window.RISPatientOrder = { sortByRoom };
})();
