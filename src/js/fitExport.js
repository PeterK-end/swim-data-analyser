// Shared FIT export helpers used by both the pool editor (editView.js) and the
// open-water editor (openWaterView.js). Extracted from editView.js so the encode
// path lives in one place.
import { Encoder, Profile, Utils } from '@garmin/fitsdk';

const STRIP_MESSAGE_KEYS = new Set([
    'mesg113Mesgs',  // Best Efforts likely incorrect -> recompute
                     // could lead to inconsistencies
]);

// Rebuilds message definitions in the Profile for unknown messages so the
// Encoder knows how to write them back out.
export function ensureProfileDefinitions(mesgDefinitions) {
    function onMesgDefinition(mesgDefinition) {
        const mesgNum = mesgDefinition.globalMessageNumber;
        let mesgProfile = Profile.messages[mesgNum];

        if (!mesgProfile) {
            mesgProfile = {
                num: mesgNum,
                name: `mesg${mesgNum}`,
                messagesKey: `mesg${mesgNum}Mesgs`,
                fields: {},
            };
            Profile.messages[mesgNum] = mesgProfile;
        }

        mesgDefinition.fieldDefinitions.forEach((fieldDefinition) => {
            const fieldProfile = mesgProfile.fields[fieldDefinition.fieldDefinitionNumber];
            if (!fieldProfile) {
                mesgProfile.fields[fieldDefinition.fieldDefinitionNumber] = {
                    num: fieldDefinition.fieldDefinitionNumber,
                    name: `field${fieldDefinition.fieldDefinitionNumber}`,
                    type: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                    baseType: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                    scale: 1,
                    offset: 0,
                    units: "",
                    bits: [],
                    components: [],
                    isAccumulated: false,
                    hasComponents: false,
                    subFields: [],
                };
            }
        });
    }
    mesgDefinitions.forEach(onMesgDefinition);
}

// Resolves message number from Profile key
export function getMesgNumByMessagesKey(messagesKey) {
    const messages = Profile.messages;
    if (typeof messages !== 'object') return null;
    for (const key in messages) {
        const definition = messages[key];
        if (definition.messagesKey === messagesKey) return parseInt(key, 10);
    }
    return null;
}

// Converts modifiedData into a flat message list for export
export function prepareExportData(modifiedData) {
    const messageGroups = Object.entries(modifiedData)
          .filter(([key, val]) =>
              Array.isArray(val) &&
              key.endsWith('Mesgs') &&
              !STRIP_MESSAGE_KEYS.has(key)
          );

    const allMessages = [];

    for (const [messageName, messages] of messageGroups) {
        const mesgNum = getMesgNumByMessagesKey(messageName);
        if (mesgNum == null) continue;
        for (const fields of messages) allMessages.push({ mesgNum, ...fields });
    }
    return allMessages;
}

// Encodes modifiedData back into a FIT byte array. Pool/Strava-specific
// pre-processing (MTB field removal, distance normalization) is applied by the
// caller before invoking this.
export function encodeFit(modifiedData, mesgDefinitions, fieldDescriptions) {
    ensureProfileDefinitions(mesgDefinitions);
    const allMessages = prepareExportData(modifiedData);

    const encoder = new Encoder({ fieldDescriptions });
    allMessages.forEach((msg) => encoder.writeMesg(msg));
    return encoder.close();
}

// Triggers a browser download for the given data.
export function downloadBlob(data, filename, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}
