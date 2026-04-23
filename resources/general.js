function onLoad() {
    if (startAddress) {
        select(startAddress);
    }
}

function select(address) {
    for (const selectedElement of document.getElementsByClassName('selected')) {
        selectedElement.classList.remove('selected');
    }

    const targetElement = document.getElementById(address.toString(16));
    if (targetElement) {
        targetElement.classList.add('selected');
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

document.addEventListener("DOMContentLoaded", onLoad);
