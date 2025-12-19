// Font-Manager 확장 - 폰트 관리
import { getContext, renderExtensionTemplateAsync } from "../../../extensions.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from "../../../slash-commands/SlashCommandArgument.js";
import { POPUP_RESULT, POPUP_TYPE, Popup } from "../../../popup.js";

// 확장 설정
const extensionName = "Font-Manager";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    fonts: [],
    presets: [],
    currentPreset: null,
    enabled: false, // 폰트 매니저 활성화 상태 - 디폴트로 비활성화
    // 현재 선택된 폰트들
    currentUiFont: null,
    currentMessageFont: null,
    // 다국어 폰트 설정
    multiLanguageEnabled: false,
    languageFonts: {
        english: null,
        korean: null,
        japanese: null,
        chinese: null
    },
    // UI 폰트 조절 값들
    uiFontSize: 14,
    uiFontWeight: 0,
    // 채팅 폰트 조절 값들
    chatFontSize: 14,
    inputFontSize: 14,
    chatFontWeight: 0,
    chatLineHeight: 1.2,
    // 테마 연동 규칙들
    themeRules: [],
    // 태그 커스텀 설정
    customTags: []
};

// 현재 선택된 프리셋 ID와 임시 폰트들
let selectedPresetId = null;
let tempUiFont = null;
let tempMessageFont = null;
let originalUIStyles = null;
let fontStyle = null;
let settings = null;
// 기본 폰트 명시적 선택 플래그
let isUIFontExplicitlyDefault = false;
let isMessageFontExplicitlyDefault = false;
// 다국어 임시 설정들
let tempMultiLanguageEnabled = null;
let tempLanguageFonts = null;
// 임시 조절값들
let tempUiFontSize = null;
let tempUiFontWeight = null;
let tempChatFontSize = null;
let tempInputFontSize = null;
let tempChatFontWeight = null;
let tempChatLineHeight = null;

// localStorage 설정 키
const STORAGE_KEY = 'font-manager-settings';
const LEGACY_STORAGE_KEY = 'font-manager-backup-settings';

// 설정 로드
function loadSettings() {
    try {
        // 먼저 새로운 키에서 로드 시도
        let savedData = localStorage.getItem(STORAGE_KEY);
        
        if (!savedData) {
            // 기존 백업 키에서 로드 시도 (마이그레이션)
            savedData = localStorage.getItem(LEGACY_STORAGE_KEY);
                    if (savedData) {
            // 새로운 키로 저장하고 기존 백업 삭제
            localStorage.setItem(STORAGE_KEY, savedData);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
        }
        
        if (savedData) {
            const parsed = JSON.parse(savedData);
            return parsed;
        } else {
            return { ...defaultSettings };
        }
    } catch (error) {
        console.error('[Font Manager] 설정 로드 실패:', error);
        return { ...defaultSettings };
    }
}

// 설정 저장
function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('[Font Manager] 설정 저장 실패:', error);
    }
}

// 설정 초기화
function initSettings() {
    settings = loadSettings();
    // 기본값 보장
    settings.fonts = settings.fonts ?? [];
    settings.presets = settings.presets ?? [];
    settings.currentPreset = settings.currentPreset ?? null;
    settings.enabled = settings.enabled ?? false;
    settings.themeRules = settings.themeRules ?? [];
    // 폰트 이름 기본값 보장
    settings.currentUiFont = settings.currentUiFont ?? null;
    settings.currentMessageFont = settings.currentMessageFont ?? null;
    // 다국어 설정 기본값 보장
    settings.multiLanguageEnabled = settings.multiLanguageEnabled ?? false;
    settings.languageFonts = settings.languageFonts ?? {
        english: null,
        korean: null,
        japanese: null,
        chinese: null
    };
    // 조절값 기본값 보장
    settings.uiFontSize = settings.uiFontSize ?? 14;
    settings.uiFontWeight = settings.uiFontWeight ?? 0;
    settings.chatFontSize = settings.chatFontSize ?? 14;
    settings.inputFontSize = settings.inputFontSize ?? 14;
    settings.chatFontWeight = settings.chatFontWeight ?? 0;
    settings.chatLineHeight = settings.chatLineHeight ?? 1.2;
    // 태그 커스텀 기본값 보장
    settings.customTags = settings.customTags ?? [];
    
    // 기본 프리셋이 없으면 생성
    if (settings.presets.length === 0) {
        const defaultPreset = {
            id: generateId(),
            name: "default",
            uiFont: null,
            messageFont: null,
            multiLanguageEnabled: false,
            languageFonts: {
                english: null,
                korean: null,
                japanese: null,
                chinese: null
            },
            uiFontSize: 14,
            uiFontWeight: 0,
            chatFontSize: 14,
            inputFontSize: 14,
            chatFontWeight: 0,
            chatLineHeight: 1.2,
            customTags: []
        };
        settings.presets.push(defaultPreset);
        settings.currentPreset = defaultPreset.id;
    } else {
        // 프리셋이 있는데 currentPreset이 유효하지 않은 경우 첫 번째 프리셋으로 설정
        if (!settings.currentPreset || !settings.presets.find(p => p.id === settings.currentPreset)) {
            settings.currentPreset = settings.presets[0].id;
        }
    }
}

// 고유 ID 생성
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 채팅 데이터 가져오기 (index (5).js 참고)
function getChatData() {
    if (window.chat && Array.isArray(window.chat)) {
        return window.chat;
    }

    if (window.SillyTavern && window.SillyTavern.getContext) {
        const context = window.SillyTavern.getContext();
        if (context && context.chat) {
            return context.chat;
        }
    }

    if (typeof chat !== 'undefined' && Array.isArray(chat)) {
        return chat;
    }

    return null;
}

// 메시지에 태그 커스텀 폰트 적용
function applyCustomTagFonts() {
    if (!settings.enabled) return;
    
    const currentPresetId = selectedPresetId ?? settings?.currentPreset;
    const presets = settings?.presets || [];
    const currentPreset = presets.find(p => p.id === currentPresetId);
    const customTags = currentPreset?.customTags ?? settings?.customTags ?? [];
    
    if (customTags.length === 0) return;
    
    // 모든 메시지 요소에 대해 처리
    document.querySelectorAll('.mes').forEach((messageElement) => {
        const mesId = messageElement.getAttribute('mesid');
        if (!mesId) return;
        
        const chatData = getChatData();
        if (!chatData) return;
        
        const messageIndex = parseInt(mesId);
        const message = chatData[messageIndex];
        if (!message || !message.mes) return;
        
        const messageContent = messageElement.querySelector('.mes_text');
        if (!messageContent) return;
        
        // 메시지 내부 데이터에서 태그 찾기 (SillyTavern은 렌더링 시 태그를 제거하므로 원본 데이터 사용)
        let processedContent = message.mes;
        let hasChanges = false;
        
        customTags.forEach(tag => {
            const tagName = tag.tagName;
            const fontName = tag.fontName;
            
            if (!tagName || !fontName) return;
            
            // 폰트 정보 가져오기
            const fonts = settings?.fonts || [];
            const selectedFont = fonts.find(f => f.name === fontName);
            const actualFontFamily = selectedFont?.fontFamily || fontName;
            
            // 대소문자 구분 없이 태그 찾기 (정규식 플래그 i 사용)
            // 여러 줄 태그 지원
            // 특수문자 이스케이프
            const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tagRegex = new RegExp(`<${escapedTagName}>([\\s\\S]*?)</${escapedTagName}>`, 'gi');
            
            processedContent = processedContent.replace(tagRegex, (match, content) => {
                hasChanges = true;
                // 줄바꿈을 <br>로 변환하여 유지
                const contentWithBreaks = content.replace(/\n/g, '<br>');
                // 태그 내용을 span으로 감싸서 폰트 적용
                return `<span data-custom-tag-font="${actualFontFamily}" style="font-family: '${actualFontFamily}', sans-serif !important;">${contentWithBreaks}</span>`;
            });
        });
        
        // 처리된 내용을 DOM에 적용 (메시지 내부 데이터는 수정하지 않음)
        if (hasChanges) {
            // 나머지 줄바꿈도 <br>로 변환
            processedContent = processedContent.replace(/\n/g, '<br>');
            messageContent.innerHTML = processedContent;
        }
    });
}

// MutationObserver로 새 메시지 렌더링 시 태그 폰트 자동 적용
function setupCustomTagObserver() {
    if (!settings.enabled) return;
    
    const observer = new MutationObserver((mutations) => {
        let shouldApply = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList?.contains('mes') ||
                         node.querySelector?.('.mes'))) {
                        shouldApply = true;
                        break;
                    }
                }
            }
        });
        
        if (shouldApply) {
            setTimeout(() => {
                applyCustomTagFonts();
            }, 100);
        }
    });
    
    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
    }
}





// 프리셋 이름 설정 팝업 표시
async function showPresetNamePopup(existingName = '') {
    let success = false;
    
    while (!success) {
        const presetNameHtml = `
            <div class="font-name-popup-content">
                <p>프리셋 이름을 설정하세요.</p>
                <input type="text" id="preset-name-input" class="font-name-input" placeholder="프리셋 이름을 입력하세요" maxlength="50" value="${existingName}">
            </div>
        `;
        
        const template = $(presetNameHtml);
        const popup = new Popup(template, POPUP_TYPE.CONFIRM, '프리셋 이름 설정', { 
            okButton: '저장', 
            cancelButton: '취소'
        });
        
        const result = await popup.show();
        
        if (!result) {
            return null;
        }
        
        const presetName = template.find('#preset-name-input').val().trim();
        
        // 프리셋 이름 유효성 검사
        if (!presetName) {
            alert('프리셋 이름을 입력해주세요.');
            continue;
        }
        
        // 중복 검사 (기존 프리셋 수정이 아닌 경우)
        if (!existingName) {
            const presets = settings?.presets || [];
            const existingPresets = presets.map(p => p.name);
            if (existingPresets.includes(presetName)) {
                alert('이미 존재하는 프리셋 이름입니다.\n다른 이름을 사용해주세요.');
                continue;
            }
        }
        
        return presetName;
    }
}

// 폰트 이름 설정 팝업 표시
async function showFontNamePopup(fontData) {
    let success = false;
    
    while (!success) {
        const fontNameHtml = `
            <div class="font-name-popup-content">
                <p>폰트 이름을 설정하세요.</p>
                <input type="text" id="font-name-input" class="font-name-input" placeholder="폰트 이름을 입력하세요" maxlength="50">
            </div>
        `;
        
        const template = $(fontNameHtml);
        const popup = new Popup(template, POPUP_TYPE.CONFIRM, '폰트 이름 설정', { 
            okButton: '저장', 
            cancelButton: '취소'
        });
        
        const result = await popup.show();
        
        if (!result) {
            return false;
        }
        
        const fontName = template.find('#font-name-input').val().trim();
        
        // 폰트 이름 유효성 검사
        if (!fontName) {
            alert('폰트 이름을 입력해주세요.');
            continue;
        }
        
        // 중복 검사
        const fonts = settings?.fonts || [];
        const existingFonts = fonts.map(f => f.name);
        if (existingFonts.includes(fontName)) {
            alert('이미 존재하는 폰트 이름입니다.\n다른 이름을 사용해주세요.');
            continue;
        }
        
        // CSS에서 실제 폰트 패밀리 이름 추출
        const actualFontFamily = extractFontFamilyFromCSS(fontData.data);
        
        // 새 폰트 생성
        const newFont = {
            id: generateId(),
            name: fontName,
            type: 'source',
            data: fontData.data,
            fontFamily: actualFontFamily || fontName // CSS에서 추출된 이름이 있으면 사용, 없으면 사용자 입력 이름
        };
        
        // 폰트 추가
        settings.fonts.push(newFont);
        
        // 폰트 CSS 업데이트
        updateUIFont();
        
        saveSettings();
        success = true;
    }
    
    return true;
}

// 폰트 관리 창 열기
async function openFontManagementPopup() {
    // 이미 열린 폰트 관리 팝업이 있는지 확인
    if ($('.popup:contains("폰트 관리")').length > 0) {
        return;
    }
    
    const template = $(await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'template'));
    
    // 저장된 현재 프리셋이 있으면 선택, 없으면 첫 번째 프리셋 선택
    const presets = settings?.presets || [];
    const currentPresetId = settings?.currentPreset;
    
    // selectedPresetId를 항상 명시적으로 설정 (이전 값 무시)
    if (currentPresetId && presets.find(p => p.id === currentPresetId)) {
        selectedPresetId = currentPresetId;
    } else if (presets.length > 0) {
        selectedPresetId = presets[0].id;
    } else {
        selectedPresetId = null;
    }
    
    // 원본 UI 스타일 저장
    saveOriginalUIStyles();
    
    // 현재 선택된 프리셋의 설정값들을 임시 변수에 로드
    if (selectedPresetId) {
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset) {
            tempUiFont = currentPreset.uiFont ?? settings.currentUiFont;
            tempMessageFont = currentPreset.messageFont ?? settings.currentMessageFont;
            tempMultiLanguageEnabled = currentPreset.multiLanguageEnabled ?? settings.multiLanguageEnabled;
            tempLanguageFonts = currentPreset.languageFonts ? { ...currentPreset.languageFonts } : { ...settings.languageFonts };
            tempUiFontSize = currentPreset.uiFontSize ?? settings.uiFontSize;
            tempUiFontWeight = currentPreset.uiFontWeight ?? settings.uiFontWeight;
            tempChatFontSize = currentPreset.chatFontSize ?? settings.chatFontSize;
            tempInputFontSize = currentPreset.inputFontSize ?? settings.inputFontSize;
            tempChatFontWeight = currentPreset.chatFontWeight ?? settings.chatFontWeight;
            tempChatLineHeight = currentPreset.chatLineHeight ?? settings.chatLineHeight;
        } else {
            // 전역 설정을 기본으로 적용
            tempUiFont = settings.currentUiFont;
            tempMessageFont = settings.currentMessageFont;
            tempMultiLanguageEnabled = settings.multiLanguageEnabled;
            tempLanguageFonts = { ...settings.languageFonts };
            tempUiFontSize = settings.uiFontSize;
            tempUiFontWeight = settings.uiFontWeight;
            tempChatFontSize = settings.chatFontSize;
            tempInputFontSize = settings.inputFontSize;
            tempChatFontWeight = settings.chatFontWeight;
            tempChatLineHeight = settings.chatLineHeight;
        }
    } else {
        // 전역 설정을 기본으로 적용
        tempUiFont = settings.currentUiFont;
        tempMessageFont = settings.currentMessageFont;
        tempMultiLanguageEnabled = settings.multiLanguageEnabled;
        tempLanguageFonts = { ...settings.languageFonts };
        tempUiFontSize = settings.uiFontSize;
        tempUiFontWeight = settings.uiFontWeight;
        tempChatFontSize = settings.chatFontSize;
        tempInputFontSize = settings.inputFontSize;
        tempChatFontWeight = settings.chatFontWeight;
        tempChatLineHeight = settings.chatLineHeight;
    }
    
    // 모든 영역 렌더링
    renderPresetDropdown(template);
    renderToggleSection(template);
    renderUIFontSection(template);
    renderMessageFontSection(template);
    renderCustomTagSection(template);
    renderMultiLanguageFontSection(template);
    renderThemeLinkingSection(template);
    renderFontAddArea(template);
    renderFontList(template);
    
    // 이벤트 리스너 추가
    setupEventListeners(template);
    
    const popup = new Popup(template, POPUP_TYPE.CONFIRM, '폰트 관리', { 
        wide: true, 
        large: true,
        okButton: '저장', 
        cancelButton: '취소'
    });
    
    const result = await popup.show();
    
    if (result) {
        // 저장 버튼을 눌렀을 때 - 현재 설정값들을 저장
        saveCurrentSettings();
    } else {
        // 취소 시 원본 스타일 복원
        restoreOriginalUIStyles();
        tempUiFont = null;
        tempMessageFont = null;
        tempMultiLanguageEnabled = null;
        tempLanguageFonts = null;
        isUIFontExplicitlyDefault = false;
        isMessageFontExplicitlyDefault = false;
        tempUiFontSize = null;
        tempUiFontWeight = null;
        tempChatFontSize = null;
        tempInputFontSize = null;
        tempChatFontWeight = null;
        tempChatLineHeight = null;
    }
    
    // 임시 변수 초기화
    tempUiFont = null;
    tempMessageFont = null;
    tempMultiLanguageEnabled = null;
    tempLanguageFonts = null;
    isUIFontExplicitlyDefault = false;
    isMessageFontExplicitlyDefault = false;
    tempUiFontSize = null;
    tempUiFontWeight = null;
    tempChatFontSize = null;
    tempInputFontSize = null;
    tempChatFontWeight = null;
    tempChatLineHeight = null;
}

// 프리셋 드롭다운 렌더링
function renderPresetDropdown(template) {
    const presets = settings?.presets || [];
    const dropdown = template.find('#preset-dropdown');
    
    dropdown.empty();
    
    if (presets.length === 0) {
        dropdown.append('<option value="">프리셋이 없습니다</option>');
        dropdown.prop('disabled', true);
    } else {
        dropdown.prop('disabled', false);
        presets.forEach(preset => {
            const isSelected = preset.id === selectedPresetId;
            dropdown.append(`<option value="${preset.id}" ${isSelected ? 'selected' : ''}>${preset.name}</option>`);
        });
    }
}

// 폰트 매니저 활성화 토글 렌더링
function renderToggleSection(template) {
    const toggle = template.find('#font-manager-enabled-toggle');
    toggle.prop('checked', settings.enabled);
    
    // enabled 상태에 따라 다른 섹션들 활성화/비활성화
    updateSectionsState(template, settings.enabled);
}

// 섹션들의 활성화 상태 업데이트
function updateSectionsState(template, enabled) {
    const sections = [
        '#ui-font-section',
        '#message-font-section',
        '#custom-tag-section',
        '#multi-language-font-section', 
        '#theme-linking-section',
        '#font-add-area',
        '#font-list-area'
    ];
    
    // 프리셋 관련 요소들
    const presetElements = template.find('.preset-selector-row');
    
    sections.forEach(sectionId => {
        const section = template.find(sectionId);
        if (enabled) {
            section.removeClass('disabled-section');
            section.find('input, select, button, textarea').prop('disabled', false);
        } else {
            section.addClass('disabled-section');
            section.find('input, select, button, textarea').prop('disabled', true);
        }
    });
    
    // 프리셋 요소들도 같이 비활성화/활성화
    if (enabled) {
        presetElements.removeClass('disabled-section');
        presetElements.find('select, button').prop('disabled', false);
    } else {
        presetElements.addClass('disabled-section');
        presetElements.find('select, button').prop('disabled', true);
    }
}

// UI 폰트 섹션 렌더링
function renderUIFontSection(template) {
    const fonts = settings?.fonts || [];
    const dropdown = template.find('#ui-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">기본 폰트</option>');
    
    fonts.forEach(font => {
        const isSelected = tempUiFont === font.name;
        dropdown.append(`<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
    });
    
    // 임시 폰트가 설정되어 있으면 그것을 선택, 없으면 기본 폰트
    if (tempUiFont) {
        dropdown.val(tempUiFont);
    } else {
        dropdown.val("");  // 기본 폰트
    }
    
    // 조절바 값들 설정 (전역 설정 우선, 임시값이 있으면 임시값 사용)
    const uiFontSize = tempUiFontSize ?? settings.uiFontSize;
    const uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
    
    template.find('#ui-font-size-slider').val(uiFontSize);
    template.find('#ui-font-size-value').text(uiFontSize + 'px');
    template.find('#ui-font-weight-slider').val(uiFontWeight);
    template.find('#ui-font-weight-value').text(uiFontWeight.toFixed(1) + 'px');
}

// 다국어 폰트 섹션 렌더링
function renderMultiLanguageFontSection(template) {
    const fonts = settings?.fonts || [];
    
    // 다국어 활성화 체크박스 설정
    const multiLangEnabled = tempMultiLanguageEnabled ?? settings.multiLanguageEnabled;
    template.find('#multi-language-enabled-toggle').prop('checked', multiLangEnabled);
    
    // 언어별 폰트 드롭다운 설정
    const languages = ['english', 'korean', 'japanese', 'chinese'];
    const languageNames = {
        english: '영어',
        korean: '한국어',
        japanese: '일본어',
        chinese: '중국어'
    };
    
    languages.forEach(lang => {
        const dropdown = template.find(`#${lang}-font-dropdown`);
        dropdown.empty();
        dropdown.append('<option value="">기본 폰트</option>');
        
        fonts.forEach(font => {
            dropdown.append(`<option value="${font.name}">${font.name}</option>`);
        });
        
        // 현재 설정된 폰트 선택
        const currentLanguageFonts = tempLanguageFonts ?? settings.languageFonts;
        const selectedFont = currentLanguageFonts[lang];
        if (selectedFont) {
            dropdown.val(selectedFont);
        } else {
            dropdown.val("");
        }
    });
    
    // 다국어 활성화 상태에 따라 섹션 활성화/비활성화
    updateMultiLanguageSectionState(template, multiLangEnabled);
}

// 다국어 섹션 활성화 상태 업데이트
function updateMultiLanguageSectionState(template, enabled) {
    const languageSelectors = template.find('.multi-language-font-selectors');
    
    if (enabled) {
        languageSelectors.removeClass('disabled-section');
        languageSelectors.find('select').prop('disabled', false);
    } else {
        languageSelectors.addClass('disabled-section');
        languageSelectors.find('select').prop('disabled', true);
    }
}

// 메시지 폰트 섹션 렌더링
function renderMessageFontSection(template) {
    const fonts = settings?.fonts || [];
    const dropdown = template.find('#message-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">기본 폰트</option>');
    
    fonts.forEach(font => {
        const isSelected = tempMessageFont === font.name;
        dropdown.append(`<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name}</option>`);
    });
    
    // 임시 폰트가 설정되어 있으면 그것을 선택, 없으면 기본 폰트
    if (tempMessageFont) {
        dropdown.val(tempMessageFont);
    } else {
        dropdown.val("");  // 기본 폰트
    }
    
    // 조절바 값들 설정 (전역 설정 우선, 임시값이 있으면 임시값 사용)
    const chatFontSize = tempChatFontSize ?? settings.chatFontSize;
    const inputFontSize = tempInputFontSize ?? settings.inputFontSize;
    const chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
    const chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
    
    template.find('#chat-font-size-slider').val(chatFontSize);
    template.find('#chat-font-size-value').text(chatFontSize + 'px');
    template.find('#input-font-size-slider').val(inputFontSize);
    template.find('#input-font-size-value').text(inputFontSize + 'px');
    template.find('#chat-font-weight-slider').val(chatFontWeight);
    template.find('#chat-font-weight-value').text(chatFontWeight.toFixed(1) + 'px');
    template.find('#chat-line-height-slider').val(chatLineHeight);
    template.find('#chat-line-height-value').text(chatLineHeight.toFixed(1) + 'rem');
}

// 태그 커스텀 섹션 렌더링
function renderCustomTagSection(template) {
    const fonts = settings?.fonts || [];
    const dropdown = template.find('#custom-tag-font-dropdown');
    
    dropdown.empty();
    dropdown.append('<option value="">폰트 선택</option>');
    
    fonts.forEach(font => {
        dropdown.append(`<option value="${font.name}">${font.name}</option>`);
    });
    
    // 현재 프리셋의 태그 목록 렌더링
    renderCustomTagList(template);
}

// 태그 커스텀 리스트 렌더링
function renderCustomTagList(template) {
    const currentPresetId = selectedPresetId ?? settings?.currentPreset;
    const presets = settings?.presets || [];
    const currentPreset = presets.find(p => p.id === currentPresetId);
    const customTags = currentPreset?.customTags ?? settings?.customTags ?? [];
    const listArea = template.find('#custom-tag-list');
    
    if (customTags.length === 0) {
        listArea.html(`
            <div class="no-custom-tags-message">
                <p>등록된 태그가 없습니다</p>
            </div>
        `);
    } else {
        let listHtml = '';
        customTags.forEach(tag => {
            const fontName = tag.fontName || '기본 폰트';
            listHtml += `
                <div class="custom-tag-item">
                    <div class="custom-tag-info">
                        <span class="custom-tag-name">&lt;${tag.tagName}&gt;</span>
                        <span class="custom-tag-arrow">→</span>
                        <span class="custom-tag-font">${fontName}</span>
                    </div>
                    <button class="remove-custom-tag-btn" data-id="${tag.id}" title="태그 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
        listArea.html(listHtml);
    }
}

// 테마 연동 섹션 렌더링
function renderThemeLinkingSection(template) {
    const presets = settings?.presets || [];
    const themeRules = settings?.themeRules || [];
    
    // 프리셋 드롭다운 옵션 생성
    let presetOptions = '<option value="">프리셋 선택</option>';
    presets.forEach(preset => {
        presetOptions += `<option value="${preset.id}">${preset.name}</option>`;
    });
    
    // 테마 연동 폼
    template.find('#theme-preset-dropdown').html(presetOptions);
    
    // 테마 규칙 리스트 렌더링
    renderThemeRulesList(template);
}

// 테마 규칙 리스트 렌더링
function renderThemeRulesList(template) {
    const themeRules = settings?.themeRules || [];
    const listArea = template.find('#theme-rules-list');
    
    if (themeRules.length === 0) {
        listArea.html(`
            <div class="no-theme-rules-message">
                <p>연동된 테마가 없습니다</p>
            </div>
        `);
    } else {
        let rulesHtml = '';
        themeRules.forEach(rule => {
            const presets = settings?.presets || [];
            const preset = presets.find(p => p.id === rule.presetId);
            const presetName = preset ? preset.name : '(삭제된 프리셋)';
            
            rulesHtml += `
                <div class="theme-rule-item">
                    <div class="theme-rule-info">
                        <span class="theme-rule-theme">${rule.themeName}</span>
                        <span class="theme-rule-arrow">→</span>
                        <span class="theme-rule-preset">${presetName}</span>
                    </div>
                    <button class="remove-theme-rule-btn" data-id="${rule.id}" title="테마 연동 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
        listArea.html(rulesHtml);
    }
}

// 폰트 추가 영역 렌더링
function renderFontAddArea(template) {
    const addAreaHtml = `
        <div class="font-add-section">
            <h3>폰트 가져오기</h3>
            <textarea id="font-source-textarea" class="font-source-textarea" placeholder="⚠️ @font-face 규칙만 등록 가능합니다&#10;&#10;올바른 형태:&#10;@font-face {&#10;  font-family: 'MyCustomFont';&#10;  src: url('https://example.com/font.woff2') format('woff2');&#10;}&#10;&#10;보안상 다른 CSS 규칙은 허용되지 않습니다."></textarea>
            <div class="font-import-button-container">
                <button id="import-font-btn" class="import-font-btn">가져오기</button>
            </div>
        </div>
    `;
    
    template.find('#font-add-area').html(addAreaHtml);
}

// 폰트 리스트 렌더링
function renderFontList(template) {
    const fonts = settings?.fonts || [];
    const listArea = template.find('#font-list-area');
    
    let listHtml = '<h3 class="font-list-title">불러온 폰트 목록</h3>';
    
    if (fonts.length === 0) {
        listHtml += `
            <div class="no-fonts-message">
                <h4>등록된 폰트가 없습니다</h4>
                <p>위의 방법을 사용하여 폰트를 추가해보세요.</p>
            </div>
        `;
    } else {
        fonts.forEach(font => {
            listHtml += `
                <div class="font-item">
                    <span class="font-name">${font.name}</span>
                    <span class="font-preview" style="font-family: '${font.name}', sans-serif;">Aa</span>
                    <button class="remove-font-btn" data-id="${font.id}" title="폰트 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
    }
    
    listArea.html(listHtml);
}

// 원본 UI 스타일 저장
function saveOriginalUIStyles() {
    // 현재 임시 폰트 상태 저장
    originalUIStyles = {
        tempUiFont: tempUiFont,
        tempMessageFont: tempMessageFont,
        tempMultiLanguageEnabled: tempMultiLanguageEnabled,
        tempLanguageFonts: tempLanguageFonts ? { ...tempLanguageFonts } : null,
        isUIFontExplicitlyDefault: isUIFontExplicitlyDefault,
        isMessageFontExplicitlyDefault: isMessageFontExplicitlyDefault,
        tempUiFontSize: tempUiFontSize,
        tempUiFontWeight: tempUiFontWeight,
        tempChatFontSize: tempChatFontSize,
        tempInputFontSize: tempInputFontSize,
        tempChatFontWeight: tempChatFontWeight,
        tempChatLineHeight: tempChatLineHeight
    };
}

// 원본 UI 스타일 복원
function restoreOriginalUIStyles() {
    // 원본 상태로 복원
    if (originalUIStyles) {
        tempUiFont = originalUIStyles.tempUiFont;
        tempMessageFont = originalUIStyles.tempMessageFont;
        tempMultiLanguageEnabled = originalUIStyles.tempMultiLanguageEnabled;
        tempLanguageFonts = originalUIStyles.tempLanguageFonts ? { ...originalUIStyles.tempLanguageFonts } : null;
        isUIFontExplicitlyDefault = originalUIStyles.isUIFontExplicitlyDefault || false;
        isMessageFontExplicitlyDefault = originalUIStyles.isMessageFontExplicitlyDefault || false;
        tempUiFontSize = originalUIStyles.tempUiFontSize;
        tempUiFontWeight = originalUIStyles.tempUiFontWeight;
        tempChatFontSize = originalUIStyles.tempChatFontSize;
        tempInputFontSize = originalUIStyles.tempInputFontSize;
        tempChatFontWeight = originalUIStyles.tempChatFontWeight;
        tempChatLineHeight = originalUIStyles.tempChatLineHeight;
    } else {
        tempUiFont = null;
        tempMessageFont = null;
        tempMultiLanguageEnabled = null;
        tempLanguageFonts = null;
        isUIFontExplicitlyDefault = false;
        isMessageFontExplicitlyDefault = false;
        tempUiFontSize = null;
        tempUiFontWeight = null;
        tempChatFontSize = null;
        tempInputFontSize = null;
        tempChatFontWeight = null;
        tempChatLineHeight = null;
    }
    updateUIFont();
}

// CSS에서 font-family 이름 추출
function extractFontFamilyFromCSS(css) {
    try {
        // @font-face 규칙에서 font-family 값 추출
        const fontFaceMatch = css.match(/@font-face\s*{[^}]*font-family\s*:\s*['"]*([^'";]+)['"]*[^}]*}/i);
        if (fontFaceMatch && fontFaceMatch[1]) {
            const fontFamily = fontFaceMatch[1].trim();
            return fontFamily;
        }
    } catch (error) {
        console.warn('[Font-Manager] font-family 추출 실패:', error);
    }
    return null;
}

// 폰트 CSS에서 src 추출
function extractSrcFromFontFace(css) {
    try {
        const srcMatch = css.match(/src\s*:\s*([^;]+);/i);
        if (srcMatch && srcMatch[1]) {
            return srcMatch[1].trim();
        }
    } catch (error) {
        console.warn('[Font-Manager] src 추출 실패:', error);
    }
    return null;
}

// CSS 검증 및 정리
const sanitize = (css) => {
    if (!css) return '';
    try {
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.append(style);
        const sheet = style.sheet;
        
        if (!sheet) {
            style.remove();
            return css;
        }
        
        const rules = Array.from(sheet.cssRules).map(it => (it.cssText) ?? '').join('\n');
        style.remove();
        return rules;
    } catch (error) {
        console.warn('[Font-Manager] CSS sanitization 실패:', error);
        return css; // 실패시 원본 반환
    }
};

// 폰트 CSS 유효성 검사 함수
function validateFontCSS(css) {
    if (!css || typeof css !== 'string') {
        return {
            isValid: false,
            error: '폰트 소스코드를 입력해주세요.'
        };
    }
    
    const cleanCss = css.trim();
    
    // 기본적인 길이 체크
    if (cleanCss.length === 0) {
        return {
            isValid: false,
            error: '폰트 소스코드를 입력해주세요.'
        };
    }
    
    // @font-face 규칙이 있는지 확인
    if (!/@font-face\s*{/.test(cleanCss)) {
        return {
            isValid: false,
            error: '@font-face 규칙이 포함된 CSS만 등록할 수 있습니다.\n\n올바른 형태:\n@font-face {\n  font-family: "FontName";\n  src: url("font.woff2");\n}'
        };
    }
    
    // font-family 속성이 있는지 확인
    if (!/font-family\s*:\s*[^;]+/i.test(cleanCss)) {
        return {
            isValid: false,
            error: '@font-face 규칙에 font-family 속성이 필요합니다.\n\n예시: font-family: "FontName";'
        };
    }
    
    // src 속성이 있는지 확인
    if (!/src\s*:\s*[^;]+/i.test(cleanCss)) {
        return {
            isValid: false,
            error: '@font-face 규칙에 src 속성이 필요합니다.\n\n예시: src: url("font.woff2") format("woff2");'
        };
    }
    
    // 위험한 CSS 규칙들 체크
    const dangerousPatterns = [
        /@import/i,           // import 규칙
        /@media/i,            // media 쿼리
        /@keyframes/i,        // 키프레임
        /@charset/i,          // charset
        /@namespace/i,        // namespace
        /javascript:/i,       // javascript 프로토콜
        /expression\s*\(/i,   // CSS expression
        /behavior\s*:/i,      // behavior 속성
        /binding\s*:/i,       // binding 속성
        /<script/i,           // script 태그
        /onclick/i,           // 이벤트 핸들러
        /onload/i,            // 이벤트 핸들러
        /onerror/i,           // 이벤트 핸들러
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(cleanCss)) {
            return {
                isValid: false,
                error: '보안상 위험한 CSS 규칙이 포함되어 있습니다.\n@font-face 규칙만 사용해주세요.'
            };
        }
    }
    
    // @font-face 블록의 개수 확인 (너무 많으면 거부)
    const fontFaceMatches = cleanCss.match(/@font-face\s*{/g);
    if (fontFaceMatches && fontFaceMatches.length > 10) {
        return {
            isValid: false,
            error: '한 번에 등록할 수 있는 @font-face 규칙은 최대 10개입니다.'
        };
    }
    
    // CSS 파싱 테스트
    try {
        const testStyle = document.createElement('style');
        testStyle.textContent = cleanCss;
        document.head.appendChild(testStyle);
        
        // CSS가 올바르게 파싱되었는지 확인
        const sheet = testStyle.sheet;
        if (!sheet || sheet.cssRules.length === 0) {
            document.head.removeChild(testStyle);
            return {
                isValid: false,
                error: 'CSS 구문에 오류가 있습니다. 올바른 CSS 형식인지 확인해주세요.'
            };
        }
        
        // @font-face 규칙만 있는지 확인
        let hasFontFaceRule = false;
        for (let i = 0; i < sheet.cssRules.length; i++) {
            const rule = sheet.cssRules[i];
            if (rule.type === CSSRule.FONT_FACE_RULE) {
                hasFontFaceRule = true;
            } else {
                document.head.removeChild(testStyle);
                return {
                    isValid: false,
                    error: '@font-face 규칙 이외의 CSS 규칙은 허용되지 않습니다.'
                };
            }
        }
        
        document.head.removeChild(testStyle);
        
        if (!hasFontFaceRule) {
            return {
                isValid: false,
                error: '유효한 @font-face 규칙을 찾을 수 없습니다.'
            };
        }
        
    } catch (error) {
        return {
            isValid: false,
            error: 'CSS 구문 오류: ' + error.message
        };
    }
    
    return {
        isValid: true,
        error: null
    };
}

// UI 폰트 업데이트
function updateUIFont() {
    // 기존 스타일 완전히 제거
    if (fontStyle) {
        fontStyle.remove();
        fontStyle = null;
    }
    
    // 새 스타일 엘리먼트 생성
    fontStyle = document.createElement('style');
    fontStyle.id = 'font-manager--ui-fonts';
    document.head.appendChild(fontStyle);
    
    // 폰트 매니저가 비활성화되어 있으면 스타일을 비움
    if (!settings.enabled) {
        fontStyle.innerHTML = '';
        return;
    }
    
    const fontCss = [];
    const uiFontCss = [];
    const cssVariables = [];
    
    // CSS 변수 설정 (전역 설정 우선)
    const uiFontSize = tempUiFontSize ?? settings.uiFontSize;
    const uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
    const chatFontSize = tempChatFontSize ?? settings.chatFontSize;
    const inputFontSize = tempInputFontSize ?? settings.inputFontSize;
    const chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
    const chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
    
    cssVariables.push(`
:root {
  --font-manager-ui-size: ${uiFontSize}px;
  --font-manager-ui-weight: ${uiFontWeight}px;
  --font-manager-chat-size: ${chatFontSize}px;
  --font-manager-input-size: ${inputFontSize}px;
  --font-manager-chat-weight: ${chatFontWeight}px;
  --font-manager-chat-line-height: ${chatLineHeight}rem;
}
    `);
    
    // 모든 폰트 CSS 적용
    const fonts = settings?.fonts || [];
    
    fonts.forEach(font => {
        if (font.type === 'source') {
            fontCss.push(`/* FONT: ${font.name} */\n${font.data}`);
        }
    });
    
    // 현재 UI 폰트 적용 (임시 폰트 우선, 없으면 전역 설정, 명시적 기본 폰트 선택 시 null)
    const currentFontName = isUIFontExplicitlyDefault ? null : (tempUiFont ?? settings.currentUiFont);
    
    // 실제 사용할 font-family 이름 찾기
    let actualFontFamily = currentFontName;
    if (currentFontName) {
        const selectedFont = fonts.find(font => font.name === currentFontName);
        if (selectedFont && selectedFont.fontFamily) {
            actualFontFamily = selectedFont.fontFamily;
        }
    }
    
    if (currentFontName && actualFontFamily) {
        uiFontCss.push(`
/* UI FONT APPLICATION - Font Manager Override */
html body,
html body input,
html body select,
html body span:not([class*="fa"]):not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd),
html body code,
html body .list-group-item,
html body .ui-widget-content .ui-menu-item-wrapper,
html body textarea:not(#send_textarea) {
  font-family: "${actualFontFamily}", Sans-Serif !important;
  font-size: var(--font-manager-ui-size) !important;
  font-weight: normal !important;
  line-height: 1.1rem !important;
  -webkit-text-stroke: var(--font-manager-ui-weight) !important;
}

/* FontAwesome 아이콘 보호 */
.fa, .fas, .far, .fab, .fal, .fad, .fass, .fasr, .fasl, .fasd,
[class*="fa-"], i[class*="fa"] {
  font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands", "Font Awesome 5 Free", "Font Awesome 5 Pro", "FontAwesome" !important;
}
        `);
    } else {
        // 기본 폰트일 때 font-family를 명시적으로 초기화하고 조절값은 적용
        uiFontCss.push(`
/* UI FONT SIZE/WEIGHT APPLICATION - Font Manager Override (Default Font) */
html body,
html body input,
html body select,
html body span:not([class*="fa"]):not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd),
html body code,
html body .list-group-item,
html body .ui-widget-content .ui-menu-item-wrapper,
html body textarea:not(#send_textarea) {
  font-family: initial !important;
  font-size: var(--font-manager-ui-size) !important;
  -webkit-text-stroke: var(--font-manager-ui-weight) !important;
}

/* FontAwesome 아이콘 보호 */
.fa, .fas, .far, .fab, .fal, .fad, .fass, .fasr, .fasl, .fasd,
[class*="fa-"], i[class*="fa"] {
  font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands", "Font Awesome 5 Free", "Font Awesome 5 Pro", "FontAwesome" !important;
}
        `);
    }
    
    // 다국어 폰트 또는 메시지 폰트 적용 결정
    const isMultiLanguageEnabled = tempMultiLanguageEnabled ?? settings.multiLanguageEnabled;
    
    if (isMultiLanguageEnabled) {
        // 다국어 폰트 모드
        const currentLanguageFonts = tempLanguageFonts ?? settings.languageFonts;
        const languageFontCss = [];
        const languageFallbacks = [];
        
        // 언어별 유니코드 범위 정의
        const UNICODE_RANGES = {
            english: ['U+0020-007F', 'U+00A0-00FF', 'U+0100-017F', 'U+1E00-1EFF'],
            korean: ['U+1100-11FF', 'U+3130-318F', 'U+AC00-D7AF', 'U+A960-A97F'],
            japanese: ['U+3040-309F', 'U+30A0-30FF', 'U+31F0-31FF', 'U+FF65-FF9F'],
            chinese: ['U+4E00-9FFF', 'U+3400-4DBF', 'U+2F00-2FDF', 'U+F900-FAFF']
        };
        
        // 각 언어별 @font-face 정의 생성
        Object.entries(currentLanguageFonts).forEach(([lang, fontName]) => {
            if (fontName && UNICODE_RANGES[lang]) {
                const selectedFont = fonts.find(font => font.name === fontName);
                if (selectedFont && selectedFont.data) {
                    // 폰트 데이터가 있는 경우
                    const unicodeRange = UNICODE_RANGES[lang].join(', ');
                    const actualFontFamily = selectedFont.fontFamily || fontName;
                    
                    let srcValue;
                    if (selectedFont.data.includes('@font-face')) {
                        const extractedSrc = extractSrcFromFontFace(selectedFont.data);
                        srcValue = extractedSrc || `local("${actualFontFamily}")`;
                    } else {
                        srcValue = `local("${actualFontFamily}")`;
                    }
                    
                    languageFontCss.push(`
@font-face {
  font-family: "font-manager-${lang}";
  src: ${srcValue};
  unicode-range: ${unicodeRange};
}`);
                } else {
                    // 시스템 폰트 사용
                    const actualFontFamily = selectedFont ? (selectedFont.fontFamily || fontName) : fontName;
                    const unicodeRange = UNICODE_RANGES[lang].join(', ');
                    
                    languageFontCss.push(`
@font-face {
  font-family: "font-manager-${lang}";
  src: local("${actualFontFamily}");
  unicode-range: ${unicodeRange};
}`);
                }
                languageFallbacks.push(`"font-manager-${lang}"`);
            }
        });
        
        // 다국어 폰트 적용 CSS
        if (languageFontCss.length > 0) {
            uiFontCss.push(`
/* MULTI-LANGUAGE FONT DEFINITIONS */
${languageFontCss.join('')}

/* MULTI-LANGUAGE MESSAGE FONT APPLICATION */
.mes_text,
.mes_text *:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd):not([class*="fa-"]):not(i[class*="fa"]) {
  font-family: ${languageFallbacks.join(', ')}, sans-serif !important;
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-family: ${languageFallbacks.join(', ')}, sans-serif !important;
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
            `);
        } else {
            // 설정된 폰트가 없는 경우
            uiFontCss.push(`
/* MULTI-LANGUAGE MODE - NO FONTS SET */
.mes_text,
.mes_text *:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd):not([class*="fa-"]):not(i[class*="fa"]) {
  font-family: initial !important;
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-family: initial !important;
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
            `);
        }
    } else {
        // 메시지 폰트 모드
        const currentMessageFontName = isMessageFontExplicitlyDefault ? null : (tempMessageFont ?? settings.currentMessageFont);
        
        // 실제 사용할 메시지 font-family 이름 찾기
        let actualMessageFontFamily = currentMessageFontName;
        if (currentMessageFontName) {
            const selectedMessageFont = fonts.find(font => font.name === currentMessageFontName);
            if (selectedMessageFont && selectedMessageFont.fontFamily) {
                actualMessageFontFamily = selectedMessageFont.fontFamily;
            }
        }
        
        if (currentMessageFontName && actualMessageFontFamily) {
            uiFontCss.push(`
/* MESSAGE FONT APPLICATION - Font Manager Override */
.mes_text,
.mes_text *:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd):not([class*="fa-"]):not(i[class*="fa"]) {
  font-family: "${actualMessageFontFamily}" !important;
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-family: "${actualMessageFontFamily}" !important;
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
            `);
        } else {
            // 기본 폰트일 때 font-family를 명시적으로 초기화하고 조절값은 적용
            uiFontCss.push(`
/* MESSAGE FONT SIZE/WEIGHT APPLICATION - Font Manager Override (Default Font) */
.mes_text,
.mes_text *:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fasd):not([class*="fa-"]):not(i[class*="fa"]) {
  font-family: initial !important;
  font-size: var(--font-manager-chat-size) !important;
  line-height: var(--font-manager-chat-line-height) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}

#send_form textarea {
  font-family: initial !important;
  font-size: var(--font-manager-input-size) !important;
  -webkit-text-stroke: var(--font-manager-chat-weight) !important;
}
            `);
        }
    }
    
    // FontAwesome 아이콘 보호
    uiFontCss.push(`
/* 메시지 텍스트 영역 FontAwesome 아이콘 보호 */
.mes_text .fa, .mes_text .fas, .mes_text .far, .mes_text .fab, .mes_text .fal, .mes_text .fad, .mes_text .fass, .mes_text .fasr, .mes_text .fasl, .mes_text .fasd,
.mes_text [class*="fa-"], .mes_text i[class*="fa"] {
  font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands", "Font Awesome 5 Free", "Font Awesome 5 Pro", "FontAwesome" !important;
}
    `);
    
    const finalCss = [
        '/*',
        ' * === CSS VARIABLES ===',
        ' */',
        cssVariables.join('\n\n'),
        '\n\n',
        '/*',
        ' * === FONT DEFINITIONS ===',
        ' */',
        fontCss.join('\n\n'),
        '\n\n',
        '/*',
        ' * === UI FONT APPLICATION ===',
        ' */',
        uiFontCss.join('\n\n')
    ].join('\n');
    
    const sanitizedCss = sanitize(finalCss);
    fontStyle.innerHTML = sanitizedCss;
}

// 현재 프리셋의 UI 폰트 가져오기
function getCurrentPresetUIFont() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFont || null;
    }
    return null;
}

// 현재 프리셋의 메시지 폰트 가져오기
function getCurrentPresetMessageFont() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.messageFont || null;
    }
    return null;
}

// 현재 프리셋의 UI 폰트 조절값들 가져오기
function getCurrentPresetUIFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFontSize || null;
    }
    return null;
}

function getCurrentPresetUIFontWeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.uiFontWeight || null;
    }
    return null;
}

// 현재 프리셋의 채팅 폰트 조절값들 가져오기
function getCurrentPresetChatFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatFontSize || null;
    }
    return null;
}

function getCurrentPresetInputFontSize() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.inputFontSize || null;
    }
    return null;
}

function getCurrentPresetChatFontWeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatFontWeight || null;
    }
    return null;
}

function getCurrentPresetChatLineHeight() {
    const currentPresetId = settings?.currentPreset;
    if (currentPresetId) {
        const presets = settings?.presets || [];
        const preset = presets.find(p => p.id === currentPresetId);
        return preset?.chatLineHeight || null;
    }
    return null;
}

// UI 폰트 임시 적용
function applyTempUIFont(fontName) {
    tempUiFont = fontName;
    isUIFontExplicitlyDefault = false; // 사용자 정의 폰트 선택 시 기본 폰트 플래그 해제
    updateUIFont();
}

// 메시지 폰트 임시 적용
function applyTempMessageFont(fontName) {
    tempMessageFont = fontName;
    isMessageFontExplicitlyDefault = false; // 사용자 정의 폰트 선택 시 기본 폰트 플래그 해제
    updateUIFont();
}

// 조절값 임시 적용 함수들
function applyTempUIFontSize(size) {
    tempUiFontSize = size;
    updateUIFont();
}

function applyTempUIFontWeight(weight) {
    tempUiFontWeight = weight;
    updateUIFont();
}

function applyTempChatFontSize(size) {
    tempChatFontSize = size;
    updateUIFont();
}

function applyTempInputFontSize(size) {
    tempInputFontSize = size;
    updateUIFont();
}

function applyTempChatFontWeight(weight) {
    tempChatFontWeight = weight;
    updateUIFont();
}

function applyTempChatLineHeight(height) {
    tempChatLineHeight = height;
    updateUIFont();
}

// 이벤트 리스너 설정
function setupEventListeners(template) {
    // 폰트 매니저 활성화 토글 이벤트
    template.find('#font-manager-enabled-toggle').off('change').on('change', function() {
        settings.enabled = $(this).prop('checked');
        saveSettings();
        updateUIFont(); // 토글 상태 변경 시 스타일 업데이트
        updateSectionsState(template, settings.enabled); // 섹션들 활성화/비활성화
    });
    
    // 프리셋 드롭다운 변경 이벤트
    template.find('#preset-dropdown').off('change').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            selectedPresetId = presetId;
            
            // 프리셋 변경 시 명시적 기본 폰트 플래그 리셋
            isUIFontExplicitlyDefault = false;
            isMessageFontExplicitlyDefault = false;
            
            // 선택된 프리셋의 폰트들과 조절값들을 임시 값으로만 적용 (전역 설정 덮어쓰지 않음)
            const presets = settings?.presets || [];
            const currentPreset = presets.find(p => p.id === presetId);
            
            // 폰트 적용
            if (currentPreset && currentPreset.uiFont) {
                applyTempUIFont(currentPreset.uiFont);
            } else {
                applyTempUIFont(null); // 기본 폰트
            }
            if (currentPreset && currentPreset.messageFont) {
                applyTempMessageFont(currentPreset.messageFont);
            } else {
                applyTempMessageFont(null); // 기본 폰트
            }
            
            // 다국어 설정 적용
            tempMultiLanguageEnabled = currentPreset?.multiLanguageEnabled ?? settings.multiLanguageEnabled;
            tempLanguageFonts = currentPreset?.languageFonts ? { ...currentPreset.languageFonts } : { ...settings.languageFonts };
            
            // 조절값들을 임시 값으로만 적용
            tempUiFontSize = currentPreset?.uiFontSize ?? settings.uiFontSize;
            tempUiFontWeight = currentPreset?.uiFontWeight ?? settings.uiFontWeight;
            tempChatFontSize = currentPreset?.chatFontSize ?? settings.chatFontSize;
            tempInputFontSize = currentPreset?.inputFontSize ?? settings.inputFontSize;
            tempChatFontWeight = currentPreset?.chatFontWeight ?? settings.chatFontWeight;
            tempChatLineHeight = currentPreset?.chatLineHeight ?? settings.chatLineHeight;
            
            renderUIFontSection(template);
            renderMessageFontSection(template);
            renderCustomTagSection(template);
            renderMultiLanguageFontSection(template);
            setupEventListeners(template);
            updateUIFont(); // 조절값 변경사항 즉시 적용
        }
    });
    
    // 프리셋 저장 버튼
    template.find('#save-preset-btn').off('click').on('click', function() {
        if (selectedPresetId) {
            saveCurrentPreset();
            alert('프리셋이 저장되었습니다.');
        } else {
            alert('저장할 프리셋을 선택해주세요.');
        }
    });
    
    // 프리셋 이름 수정 버튼
    template.find('#edit-preset-btn').off('click').on('click', async function() {
        if (!selectedPresetId) {
            alert('수정할 프리셋을 선택해주세요.');
            return;
        }
        
                 const presets = settings?.presets || [];
         const currentPreset = presets.find(p => p.id === selectedPresetId);
        const newName = await showPresetNamePopup(currentPreset.name);
        
        if (newName) {
            currentPreset.name = newName;
            saveSettings();
            renderPresetDropdown(template);
            renderThemeLinkingSection(template);
            setupEventListeners(template);
        }
    });
    
    // 프리셋 삭제 버튼
    template.find('#delete-preset-btn').off('click').on('click', function() {
        if (selectedPresetId && confirm('선택된 프리셋을 삭제하시겠습니까?')) {
            deletePreset(template, selectedPresetId);
        }
    });
    
    // 프리셋 추가 버튼
    template.find('#add-preset-btn').off('click').on('click', async function() {
        const presetName = await showPresetNamePopup();
        if (presetName) {
            const newPreset = {
                id: generateId(),
                name: presetName,
                uiFont: null,
                messageFont: null,
                customTags: []
            };
            
            // 프리셋 추가
            settings.presets.push(newPreset);
            selectedPresetId = newPreset.id;
            
            // 설정 저장
            saveSettings();
            
            renderPresetDropdown(template);
            renderUIFontSection(template);
            renderMessageFontSection(template);
            renderCustomTagSection(template);
            renderMultiLanguageFontSection(template);
            renderThemeLinkingSection(template);
            setupEventListeners(template);
        }
    });
    
    // UI 폰트 드롭다운 변경 이벤트
    template.find('#ui-font-dropdown').off('change').on('change', function() {
        const fontName = $(this).val();
        if (fontName && fontName !== "") {
            isUIFontExplicitlyDefault = false;
            applyTempUIFont(fontName);
        } else {
            // 기본 폰트 선택 - 명시적으로 기본 폰트 플래그 설정
            isUIFontExplicitlyDefault = true;
            tempUiFont = null;
            updateUIFont();
        }
    });
    
    // 메시지 폰트 드롭다운 변경 이벤트
    template.find('#message-font-dropdown').off('change').on('change', function() {
        const fontName = $(this).val();
        if (fontName && fontName !== "") {
            isMessageFontExplicitlyDefault = false;
            applyTempMessageFont(fontName);
        } else {
            // 기본 폰트 선택 - 명시적으로 기본 폰트 플래그 설정
            isMessageFontExplicitlyDefault = true;
            tempMessageFont = null;
            updateUIFont();
        }
    });
    
    // 다국어 폰트 활성화 토글 이벤트
    template.find('#multi-language-enabled-toggle').off('change').on('change', function() {
        tempMultiLanguageEnabled = $(this).prop('checked');
        updateMultiLanguageSectionState(template, tempMultiLanguageEnabled);
        updateUIFont(); // 다국어 설정 변경 시 폰트 업데이트
    });
    
    // 언어별 폰트 드롭다운 변경 이벤트
    const languages = ['english', 'korean', 'japanese', 'chinese'];
    languages.forEach(lang => {
        template.find(`#${lang}-font-dropdown`).off('change').on('change', function() {
            const fontName = $(this).val();
            if (!tempLanguageFonts) {
                tempLanguageFonts = { ...settings.languageFonts };
            }
            tempLanguageFonts[lang] = fontName || null;
            updateUIFont(); // 언어별 폰트 변경 시 즉시 적용
        });
    });
    
    // UI 폰트 조절바 이벤트들
    template.find('#ui-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#ui-font-size-value').text(size + 'px');
        applyTempUIFontSize(size);
    });
    
    template.find('#ui-font-weight-slider').off('input').on('input', function() {
        const weight = parseFloat($(this).val());
        template.find('#ui-font-weight-value').text(weight.toFixed(1) + 'px');
        applyTempUIFontWeight(weight);
    });
    
    // 채팅 폰트 조절바 이벤트들
    template.find('#chat-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#chat-font-size-value').text(size + 'px');
        applyTempChatFontSize(size);
    });
    
    template.find('#input-font-size-slider').off('input').on('input', function() {
        const size = parseInt($(this).val());
        template.find('#input-font-size-value').text(size + 'px');
        applyTempInputFontSize(size);
    });
    
    template.find('#chat-font-weight-slider').off('input').on('input', function() {
        const weight = parseFloat($(this).val());
        template.find('#chat-font-weight-value').text(weight.toFixed(1) + 'px');
        applyTempChatFontWeight(weight);
    });
    
    template.find('#chat-line-height-slider').off('input').on('input', function() {
        const height = parseFloat($(this).val());
        template.find('#chat-line-height-value').text(height.toFixed(1) + 'rem');
        applyTempChatLineHeight(height);
    });
    
    // 소스코드 가져오기 버튼
    template.find('#import-font-btn').off('click').on('click', async function() {
        const sourceCode = template.find('#font-source-textarea').val().trim();
        if (!sourceCode) {
            alert('폰트 소스코드를 입력해주세요.');
            return;
        }
        
        // CSS 유효성 검사
        const validation = validateFontCSS(sourceCode);
        if (!validation.isValid) {
            alert('❌ 폰트 등록 실패\n\n' + validation.error);
            return;
        }
        
        const success = await showFontNamePopup({
            type: 'source',
            data: sourceCode
        });
        
        if (success) {
            template.find('#font-source-textarea').val('');
            renderUIFontSection(template);
            renderMessageFontSection(template);
            renderMultiLanguageFontSection(template);
            renderThemeLinkingSection(template);
            renderFontList(template);
            setupEventListeners(template);
        }
    });
    

    
    // 폰트 삭제 버튼 이벤트
    template.find('.remove-font-btn').off('click').on('click', function() {
        const fontId = $(this).data('id');
        if (confirm('이 폰트를 삭제하시겠습니까?')) {
            deleteFont(template, fontId);
        }
    });
    
    // 태그 커스텀 추가 버튼 이벤트
    template.find('#add-custom-tag-btn').off('click').on('click', function() {
        const tagName = template.find('#custom-tag-name-input').val().trim();
        const fontName = template.find('#custom-tag-font-dropdown').val();
        
        if (!tagName) {
            alert('태그 이름을 입력해주세요.');
            return;
        }
        
        if (!fontName) {
            alert('폰트를 선택해주세요.');
            return;
        }
        
        // 현재 프리셋 가져오기
        const currentPresetId = selectedPresetId ?? settings?.currentPreset;
        const presets = settings?.presets || [];
        const currentPreset = presets.find(p => p.id === currentPresetId);
        
        if (!currentPreset) {
            alert('프리셋을 먼저 선택해주세요.');
            return;
        }
        
        // 중복 검사 (대소문자 구분 없음)
        const existingTags = currentPreset.customTags || [];
        const tagNameLower = tagName.toLowerCase();
        if (existingTags.some(tag => tag.tagName.toLowerCase() === tagNameLower)) {
            alert('이미 등록된 태그입니다.');
            return;
        }
        
        // 새 태그 추가
        const newTag = {
            id: generateId(),
            tagName: tagName,
            fontName: fontName
        };
        
        if (!currentPreset.customTags) {
            currentPreset.customTags = [];
        }
        currentPreset.customTags.push(newTag);
        
        // 입력 필드 초기화
        template.find('#custom-tag-name-input').val('');
        template.find('#custom-tag-font-dropdown').val('');
        
        // 리스트 업데이트
        renderCustomTagList(template);
        setupCustomTagEventListeners(template);
        
        // 설정 저장
        saveSettings();
        
        // 메시지에 즉시 적용
        applyCustomTagFonts();
    });
    
    // 태그 커스텀 삭제 버튼 이벤트
    setupCustomTagEventListeners(template);
    
    // UI 폰트 기본값 버튼 이벤트
    template.find('#ui-font-reset-btn').off('click').on('click', function() {
        // 기본값으로 초기화
        const defaultUIFontSize = 14;
        const defaultUIFontWeight = 0;
        
        // 임시 값 업데이트
        tempUiFontSize = defaultUIFontSize;
        tempUiFontWeight = defaultUIFontWeight;
        
        // UI 업데이트
        template.find('#ui-font-size-slider').val(defaultUIFontSize);
        template.find('#ui-font-size-value').text(defaultUIFontSize + 'px');
        template.find('#ui-font-weight-slider').val(defaultUIFontWeight);
        template.find('#ui-font-weight-value').text(defaultUIFontWeight.toFixed(1) + 'px');
        
        // 실시간 적용
        updateUIFont();
    });
    
    // 메시지 폰트 기본값 버튼 이벤트
    template.find('#message-font-reset-btn').off('click').on('click', function() {
        // 기본값으로 초기화
        const defaultChatFontSize = 14;
        const defaultInputFontSize = 14;
        const defaultChatFontWeight = 0;
        const defaultChatLineHeight = 1.2;
        
        // 임시 값 업데이트
        tempChatFontSize = defaultChatFontSize;
        tempInputFontSize = defaultInputFontSize;
        tempChatFontWeight = defaultChatFontWeight;
        tempChatLineHeight = defaultChatLineHeight;
        
        // UI 업데이트
        template.find('#chat-font-size-slider').val(defaultChatFontSize);
        template.find('#chat-font-size-value').text(defaultChatFontSize + 'px');
        template.find('#input-font-size-slider').val(defaultInputFontSize);
        template.find('#input-font-size-value').text(defaultInputFontSize + 'px');
        template.find('#chat-font-weight-slider').val(defaultChatFontWeight);
        template.find('#chat-font-weight-value').text(defaultChatFontWeight.toFixed(1) + 'px');
        template.find('#chat-line-height-slider').val(defaultChatLineHeight);
        template.find('#chat-line-height-value').text(defaultChatLineHeight.toFixed(1) + 'rem');
        
        // 실시간 적용
        updateUIFont();
    });
    
    // 테마 연동 추가 버튼
    template.find('#add-theme-rule-btn').off('click').on('click', function() {
        const themeName = template.find('#theme-name-input').val().trim();
        const presetId = template.find('#theme-preset-dropdown').val();
        
        if (!themeName) {
            alert('테마 이름을 입력해주세요.');
            return;
        }
        
        if (!presetId) {
            alert('연동할 프리셋을 선택해주세요.');
            return;
        }
        
        // 중복 검사
        const themeRules = settings?.themeRules || [];
        if (themeRules.find(rule => rule.themeName === themeName)) {
            alert('이미 연동된 테마 이름입니다.');
            return;
        }
        
        // 새 연동 규칙 추가
        const newRule = {
            id: generateId(),
            themeName: themeName,
            presetId: presetId
        };
        
        settings.themeRules.push(newRule);
        
        // UI 초기화 및 업데이트
        template.find('#theme-name-input').val('');
        template.find('#theme-preset-dropdown').val('');
        renderThemeRulesList(template);
        setupThemeRuleEventListeners(template);
        
        saveSettings();
        alert('테마 연동이 추가되었습니다.');
    });
    
    // 테마 연동 삭제 버튼들에 이벤트 추가
    setupThemeRuleEventListeners(template);
    
    // 프리셋 내보내기 버튼
    template.find('#export-preset-btn').off('click').on('click', function() {
        exportSettings();
    });
    
    // 전체 설정 내보내기 버튼
    template.find('#export-all-settings-btn').off('click').on('click', function() {
        exportAllSettings();
    });
    
    // 설정 불러오기 버튼
    template.find('#import-settings-btn').off('click').on('click', function() {
        template.find('#import-file-input').click();
    });
    
    // 파일 입력 이벤트
    template.find('#import-file-input').off('change').on('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            importSettings(file, template);
            // 파일 입력 초기화 (같은 파일을 다시 선택할 수 있도록)
            $(this).val('');
        }
    });
    
    // 설정 초기화 버튼
    template.find('#reset-settings-btn').off('click').on('click', function() {
        resetSettings(template);
    });
}

// 태그 커스텀 이벤트 리스너 설정
function setupCustomTagEventListeners(template) {
    template.find('.remove-custom-tag-btn').off('click').on('click', function() {
        const tagId = $(this).data('id');
        if (confirm('이 태그를 삭제하시겠습니까?')) {
            deleteCustomTag(template, tagId);
        }
    });
}

// 태그 커스텀 삭제
function deleteCustomTag(template, tagId) {
    const currentPresetId = selectedPresetId ?? settings?.currentPreset;
    const presets = settings?.presets || [];
    const currentPreset = presets.find(p => p.id === currentPresetId);
    
    if (!currentPreset || !currentPreset.customTags) return;
    
    const tagIndex = currentPreset.customTags.findIndex(tag => tag.id === tagId);
    
    if (tagIndex !== -1) {
        currentPreset.customTags.splice(tagIndex, 1);
        
        // UI 업데이트
        renderCustomTagList(template);
        setupCustomTagEventListeners(template);
        
        saveSettings();
        
        // 메시지에 즉시 적용
        applyCustomTagFonts();
    }
}

// 테마 규칙 이벤트 리스너 설정
function setupThemeRuleEventListeners(template) {
    template.find('.remove-theme-rule-btn').off('click').on('click', function() {
        const ruleId = $(this).data('id');
        if (confirm('이 테마 연동을 삭제하시겠습니까?')) {
            deleteThemeRule(template, ruleId);
        }
    });
}

// 테마 규칙 삭제
function deleteThemeRule(template, ruleId) {
    if (!settings?.themeRules) return;
    
    const themeRules = settings.themeRules;
    const ruleIndex = themeRules.findIndex(rule => rule.id === ruleId);
    
    if (ruleIndex !== -1) {
        themeRules.splice(ruleIndex, 1);
        
        // UI 업데이트
        renderThemeRulesList(template);
        setupThemeRuleEventListeners(template);
        
        saveSettings();
    }
}

// 현재 설정값들을 설정에 저장 (팝업 저장 버튼용)
function saveCurrentSettings() {
    // 현재 선택된 프리셋을 설정에 저장
    if (selectedPresetId) {
        settings.currentPreset = selectedPresetId;
        
        // 현재 선택된 프리셋의 내용도 업데이트
        const presets = settings?.presets || [];
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        if (currentPreset) {
            // 프리셋에 현재 임시 설정값들 저장
            currentPreset.uiFont = tempUiFont;
            currentPreset.messageFont = tempMessageFont;
            currentPreset.multiLanguageEnabled = tempMultiLanguageEnabled ?? settings.multiLanguageEnabled;
            currentPreset.languageFonts = tempLanguageFonts ? { ...tempLanguageFonts } : { ...settings.languageFonts };
            currentPreset.uiFontSize = tempUiFontSize ?? settings.uiFontSize;
            currentPreset.uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
            currentPreset.chatFontSize = tempChatFontSize ?? settings.chatFontSize;
            currentPreset.inputFontSize = tempInputFontSize ?? settings.inputFontSize;
            currentPreset.chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
            currentPreset.chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
            // customTags는 이미 프리셋에 저장되어 있으므로 그대로 유지
        }
    }
    
    // 폰트 이름들 저장
    settings.currentUiFont = tempUiFont;
    settings.currentMessageFont = tempMessageFont;
    
    // 다국어 설정 저장
    if (tempMultiLanguageEnabled !== null) {
        settings.multiLanguageEnabled = tempMultiLanguageEnabled;
    }
    if (tempLanguageFonts !== null) {
        settings.languageFonts = { ...tempLanguageFonts };
    }
    
    // 현재 임시값들을 설정에 저장
    if (tempUiFontSize !== null) {
        settings.uiFontSize = tempUiFontSize;
    }
    if (tempUiFontWeight !== null) {
        settings.uiFontWeight = tempUiFontWeight;
    }
    if (tempChatFontSize !== null) {
        settings.chatFontSize = tempChatFontSize;
    }
    if (tempInputFontSize !== null) {
        settings.inputFontSize = tempInputFontSize;
    }
    if (tempChatFontWeight !== null) {
        settings.chatFontWeight = tempChatFontWeight;
    }
    if (tempChatLineHeight !== null) {
        settings.chatLineHeight = tempChatLineHeight;
    }
    
    // 설정 저장
    saveSettings();
    
    // UI 업데이트 (현재 적용된 스타일 유지)
    updateUIFont();
}

// 현재 프리셋 저장 (전역 설정 + 프리셋에 모두 저장)
function saveCurrentPreset() {
    if (!selectedPresetId) return;
    
    const presets = settings?.presets || [];
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
        // 프리셋에 저장
        preset.uiFont = tempUiFont;
        preset.messageFont = tempMessageFont;
        preset.multiLanguageEnabled = tempMultiLanguageEnabled ?? settings.multiLanguageEnabled;
        preset.languageFonts = tempLanguageFonts ? { ...tempLanguageFonts } : { ...settings.languageFonts };
        preset.uiFontSize = tempUiFontSize ?? settings.uiFontSize;
        preset.uiFontWeight = tempUiFontWeight ?? settings.uiFontWeight;
        preset.chatFontSize = tempChatFontSize ?? settings.chatFontSize;
        preset.inputFontSize = tempInputFontSize ?? settings.inputFontSize;
        preset.chatFontWeight = tempChatFontWeight ?? settings.chatFontWeight;
        preset.chatLineHeight = tempChatLineHeight ?? settings.chatLineHeight;
        // customTags는 이미 프리셋에 저장되어 있으므로 그대로 유지
        
        // 전역 설정에도 저장
        settings.currentUiFont = tempUiFont;
        settings.currentMessageFont = tempMessageFont;
        if (tempMultiLanguageEnabled !== null) {
            settings.multiLanguageEnabled = tempMultiLanguageEnabled;
        }
        if (tempLanguageFonts !== null) {
            settings.languageFonts = { ...tempLanguageFonts };
        }
        if (tempUiFontSize !== null) {
            settings.uiFontSize = tempUiFontSize;
        }
        if (tempUiFontWeight !== null) {
            settings.uiFontWeight = tempUiFontWeight;
        }
        if (tempChatFontSize !== null) {
            settings.chatFontSize = tempChatFontSize;
        }
        if (tempInputFontSize !== null) {
            settings.inputFontSize = tempInputFontSize;
        }
        if (tempChatFontWeight !== null) {
            settings.chatFontWeight = tempChatFontWeight;
        }
        if (tempChatLineHeight !== null) {
            settings.chatLineHeight = tempChatLineHeight;
        }
        
        // 현재 프리셋으로 설정
        settings.currentPreset = selectedPresetId;
        
        saveSettings();
        updateUIFont();
    }
}

// 프리셋 삭제
function deletePreset(template, presetId) {
    if (!settings?.presets) return;
    
    const presets = settings.presets;
    const presetIndex = presets.findIndex(p => p.id === presetId);
    
    if (presetIndex !== -1) {
        presets.splice(presetIndex, 1);
        
        // 현재 프리셋이 삭제된 프리셋이면 초기화
        if (settings.currentPreset === presetId) {
            settings.currentPreset = null;
        }
        
        // 선택된 프리셋 조정
        if (presets.length > 0) {
            selectedPresetId = presets[0].id;
        } else {
            selectedPresetId = null;
        }
        
        // UI 업데이트
        renderPresetDropdown(template);
        renderUIFontSection(template);
        renderMessageFontSection(template);
        renderMultiLanguageFontSection(template);
        renderThemeLinkingSection(template);
        setupEventListeners(template);
        
        // 설정 저장
        saveSettings();
        updateUIFont();
    }
}

// 폰트 삭제
function deleteFont(template, fontId) {
    if (!settings?.fonts) return;
    
    const fonts = settings.fonts;
    const fontIndex = fonts.findIndex(f => f.id === fontId);
    
    if (fontIndex !== -1) {
        // 배열에서 제거
        fonts.splice(fontIndex, 1);
        
        // UI 업데이트
        renderUIFontSection(template);
        renderMessageFontSection(template);
        renderMultiLanguageFontSection(template);
        renderThemeLinkingSection(template);
        renderFontList(template);
        setupEventListeners(template);
        
        saveSettings();
        updateUIFont();
    }
}

// 모든 폰트 업데이트 (초기 로드용)  
function updateAllFonts() {
    updateUIFont();
    // 테마 자동 감지 시작
    startThemeDetection();
    // 태그 커스텀 옵저버 시작
    setTimeout(() => {
        setupCustomTagObserver();
        applyCustomTagFonts();
    }, 1000);
}

// 테마 감지 및 자동 프리셋 적용 시작
function startThemeDetection() {
    // 페이지 로드 시 한 번 실행
    setTimeout(() => {
        checkAndApplyThemePreset();
    }, 1000);
    
    // SillyTavern 테마 적용 이벤트 감지
    setupSillyTavernThemeListeners();
}

// 테마 확인 및 자동 프리셋 적용
function checkAndApplyThemePreset() {
    const themeRules = settings?.themeRules || [];
    
    if (themeRules.length === 0) {
        return;
    }
    
    // 감지된 테마 이름 확인 (console.log 후킹으로 캐치된 것)
    const detectedTheme = window.fontManagerDetectedTheme;
    if (!detectedTheme) {
        return;
    }
    
    // 테마 규칙 확인
    let matchedRule = null;
    
    for (const rule of themeRules) {
        if (!rule.themeName) continue;
        
        const themeNameLower = rule.themeName.toLowerCase();
        const detectedThemeLower = detectedTheme.toLowerCase();
        
        // 테마 이름 매칭 (정확히 일치하거나 포함되는지 확인)
        const isMatched = themeNameLower === detectedThemeLower || 
                         detectedThemeLower.includes(themeNameLower) ||
                         themeNameLower.includes(detectedThemeLower);
        
        if (isMatched) {
            matchedRule = rule;
            break;
        }
    }
    
    if (matchedRule) {
        // 매칭된 프리셋 적용
        applyPresetById(matchedRule.presetId);
    }
}

// ID로 프리셋 적용
function applyPresetById(presetId) {
    const presets = settings?.presets || [];
    const preset = presets.find(p => p.id === presetId);
    
    if (!preset) {
        return;
    }
    
    const previousPresetId = settings.currentPreset;
    
    // 이전 프리셋과 다른 경우에만 전역 설정 변경
    if (previousPresetId !== presetId) {
        
        // 전역 설정을 프리셋 값들로 완전 교체
        settings.currentUiFont = preset.uiFont || null;
        settings.currentMessageFont = preset.messageFont || null;
        settings.multiLanguageEnabled = preset.multiLanguageEnabled ?? false;
        settings.languageFonts = preset.languageFonts ? { ...preset.languageFonts } : {
            english: null,
            korean: null,
            japanese: null,
            chinese: null
        };
        settings.uiFontSize = preset.uiFontSize ?? 14;
        settings.uiFontWeight = preset.uiFontWeight ?? 0;
        settings.chatFontSize = preset.chatFontSize ?? 14;
        settings.inputFontSize = preset.inputFontSize ?? 14;
        settings.chatFontWeight = preset.chatFontWeight ?? 0;
        settings.chatLineHeight = preset.chatLineHeight ?? 1.2;
        
        // 현재 프리셋 설정
        settings.currentPreset = presetId;
        
        // 설정 저장
        saveSettings();
    }
    
    // 프리셋의 폰트들과 조절값들을 임시 변수에 설정 (UI 업데이트용)
    tempUiFont = preset.uiFont || null;
    tempMessageFont = preset.messageFont || null;
    tempMultiLanguageEnabled = preset.multiLanguageEnabled ?? settings.multiLanguageEnabled;
    tempLanguageFonts = preset.languageFonts ? { ...preset.languageFonts } : { ...settings.languageFonts };
    tempUiFontSize = preset.uiFontSize ?? settings.uiFontSize;
    tempUiFontWeight = preset.uiFontWeight ?? settings.uiFontWeight;
    tempChatFontSize = preset.chatFontSize ?? settings.chatFontSize;
    tempInputFontSize = preset.inputFontSize ?? settings.inputFontSize;
    tempChatFontWeight = preset.chatFontWeight ?? settings.chatFontWeight;
    tempChatLineHeight = preset.chatLineHeight ?? settings.chatLineHeight;
    
    // 폰트 적용
    updateUIFont();
}

// SillyTavern 테마 이벤트 감지 설정
function setupSillyTavernThemeListeners() {
    // console.log 후킹으로 "theme applied:" 메시지 감지
    const originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(console, args);
        
        const message = args.join(' ');
        if (message.includes('theme applied:')) {
            const themeMatch = message.match(/theme applied:\s*(.+)/i);
            if (themeMatch) {
                const themeName = themeMatch[1].trim();
                // 감지된 테마 이름을 저장
                window.fontManagerDetectedTheme = themeName;
                setTimeout(() => {
                    checkAndApplyThemePreset();
                }, 200);
            }
        }
    };
}

// 슬래시 커맨드 등록
function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'font',
            callback: async (parsedArgs) => {
                openFontManagementPopup();
                return '';
            },
            helpString: '폰트 관리 창을 엽니다.\n사용법: /font',
            namedArgumentList: [],
            returns: '폰트 관리 창 열기',
        }));
    } catch (error) {
        // 실패 시 5초 후 재시도
        setTimeout(registerSlashCommands, 5000);
    }
}

// 요술봉메뉴에 버튼 추가
async function addToWandMenu() {
    try {
        const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
        
        const extensionsMenu = $("#extensionsMenu");
        if (extensionsMenu.length > 0) {
            extensionsMenu.append(buttonHtml);
            $("#font_manager_button").on("click", openFontManagementPopup);
        } else {
            setTimeout(addToWandMenu, 1000);
        }
    } catch (error) {
        // 버튼 로드 실패시 재시도
        setTimeout(addToWandMenu, 1000);
    }
}

// 설정 내보내기
function exportSettings() {
    try {
        if (!selectedPresetId) {
            alert('내보낼 프리셋을 먼저 선택해주세요.');
            return;
        }
        
        const presets = settings?.presets || [];
        const currentPreset = presets.find(p => p.id === selectedPresetId);
        
        if (!currentPreset) {
            alert('선택된 프리셋을 찾을 수 없습니다.');
            return;
        }
        
        // 현재 전역에서 사용 중인 모든 폰트들 포함 (전체 설정 내보내기와 동일하게)
        const allFonts = settings.fonts || [];
        
        // 현재 선택된 프리셋 정보
        const currentPresetInfo = {
            selectedPresetId: selectedPresetId,
            selectedPresetName: currentPreset.name
        };
        
        // 최소한의 설정만 포함 (선택된 프리셋과 모든 폰트)
        const minimalSettings = {
            enabled: settings.enabled,
            fonts: allFonts,
            presets: [currentPreset], // 현재 선택된 프리셋만
            themeRules: [], // 테마 연동은 제외 (필요시 별도 내보내기 기능 추가 가능)
            // 전역 설정들은 프리셋 적용 시 덮어써지므로 기본값으로
            currentUiFont: null,
            currentMessageFont: null,
            uiFontSize: 14,
            uiFontWeight: 0,
            chatFontSize: 14,
            inputFontSize: 14,
            chatFontWeight: 0,
            chatLineHeight: 1.2,
            currentPreset: selectedPresetId
        };
        
        const exportData = {
            version: "2.0",
            timestamp: new Date().toISOString(),
            currentPreset: currentPresetInfo,
            settings: minimalSettings
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // 파일명 생성 (프리셋 이름과 날짜 포함)
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
        const safePresetName = currentPreset.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        const filename = `font-preset-${safePresetName}-${dateStr}-${timeStr}.json`;
        
        // 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // 성공 메시지
        setTimeout(() => {
            alert(`프리셋이 성공적으로 내보내졌습니다!\n\n` +
                  `프리셋: ${currentPreset.name}\n` +
                  `폰트: ${allFonts.length}개 (전체 폰트 포함)\n` +
                  `파일명: ${filename}`);
        }, 100);
        
    } catch (error) {
        console.error('[Font Manager] 설정 내보내기 실패:', error);
        alert('설정 내보내기에 실패했습니다.\n오류: ' + error.message);
    }
}

// 전체 설정 내보내기 (필요시 사용)
function exportAllSettings() {
    try {
        // 현재 선택된 프리셋 정보 포함
        const currentPresetInfo = selectedPresetId ? {
            selectedPresetId: selectedPresetId,
            selectedPresetName: (() => {
                const presets = settings?.presets || [];
                const preset = presets.find(p => p.id === selectedPresetId);
                return preset ? preset.name : null;
            })()
        } : null;
        
        const exportData = {
            version: "2.0",
            timestamp: new Date().toISOString(),
            currentPreset: currentPresetInfo,
            settings: JSON.parse(JSON.stringify(settings))
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // 파일명 생성 (날짜 포함)
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
        const filename = `font-manager-all-settings-${dateStr}-${timeStr}.json`;
        
        // 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // 성공 메시지
        setTimeout(() => {
            alert(`전체 설정이 성공적으로 내보내졌습니다!\n\n` +
                  `폰트: ${(settings.fonts || []).length}개\n` +
                  `프리셋: ${(settings.presets || []).length}개\n` +
                  `테마연동: ${(settings.themeRules || []).length}개\n` +
                  `파일명: ${filename}`);
        }, 100);
        
    } catch (error) {
        console.error('[Font Manager] 전체 설정 내보내기 실패:', error);
        alert('전체 설정 내보내기에 실패했습니다.\n오류: ' + error.message);
    }
}

// 설정 불러오기
function importSettings(file, template) {
    if (!file) return;
    
    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기가 너무 큽니다. (최대 10MB)');
        return;
    }
    
    // 파일 확장자 체크
    if (!file.name.toLowerCase().endsWith('.json')) {
        alert('JSON 파일만 지원됩니다.');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // 데이터 유효성 검사
            if (!validateImportData(importData)) {
                alert('올바르지 않은 폰트 매니저 설정 파일입니다.');
                return;
            }
            
            // 파일 유형에 따른 확인 메시지
            let confirmationMessage = '';
            const version = importData.version || "1.0";
            const isPresetFile = version === "2.0" && importData.currentPreset && 
                               (importData.settings.presets?.length === 1);
            
            if (isPresetFile) {
                // 프리셋 파일인 경우
                const presetName = importData.currentPreset.selectedPresetName || '알 수 없는 프리셋';
                const fontCount = importData.settings.fonts?.length || 0;
                
                confirmationMessage = 
                    `프리셋 파일을 불러오시겠습니까?\n\n` +
                    `📁 파일 내용:\n` +
                    `  • 프리셋: ${presetName}\n` +
                    `  • 폰트: ${fontCount}개\n\n` +
                    `✅ 기존 설정은 유지되고 새로운 내용만 추가됩니다.\n` +
                    `🎯 현재 선택된 프리셋은 그대로 유지됩니다.\n` +
                    `(중복되는 이름이 있으면 건너뜁니다)`;
            } else {
                // 전체 설정 파일인 경우
                const presetCount = importData.settings.presets?.length || 0;
                const fontCount = importData.settings.fonts?.length || 0;
                const themeCount = importData.settings.themeRules?.length || 0;
                
                confirmationMessage = 
                    `전체 설정 파일을 불러오시겠습니까?\n\n` +
                    `📁 파일 내용:\n` +
                    `  • 프리셋: ${presetCount}개\n` +
                    `  • 폰트: ${fontCount}개\n` +
                    `  • 테마연동: ${themeCount}개\n\n` +
                    `✅ 기존 설정은 모두 유지되고 새로운 내용만 추가됩니다.\n` +
                    `🎯 현재 선택된 프리셋과 설정값들이 그대로 유지됩니다.\n` +
                    `⚙️ 확장 활성화 상태만 파일의 설정으로 변경됩니다.\n\n` +
                    `💡 안전을 위해 현재 설정을 먼저 백업하는 것을 권장합니다.`;
            }
            
            const confirmation = confirm(confirmationMessage);
            
            if (!confirmation) return;
            
            // 설정 적용
            const newSettings = importData.settings;
            
            console.log(`[Font Manager] 설정 불러오기 시작 - 파일 버전: ${importData.version || "1.0"}`);
            console.log(`[Font Manager] 병합 전 현재 상태:`);
            console.log(`  - 폰트: ${(settings.fonts || []).length}개`);
            console.log(`  - 프리셋: ${(settings.presets || []).length}개`);
            console.log(`  - 테마연동: ${(settings.themeRules || []).length}개`);
            
            // 전역 설정들의 충돌 없는 병합 처리
            mergeGlobalSettings(newSettings);
            
            console.log(`[Font Manager] 병합 완료 후 상태:`);
            console.log(`  - 폰트: ${(settings.fonts || []).length}개`);
            console.log(`  - 프리셋: ${(settings.presets || []).length}개`);
            console.log(`  - 테마연동: ${(settings.themeRules || []).length}개`);
            
            // localStorage 저장
            saveSettings();
            
            // UI 업데이트 (안전한 방식으로)
            setTimeout(() => {
                refreshCurrentPopup(template);
                
                // 콘솔에만 성공 메시지 출력
                console.log('[Font Manager] 설정이 성공적으로 불러와졌습니다!');
            }, 100);
            
        } catch (error) {
            console.error('[Font Manager] 설정 불러오기 실패:', error);
            alert('설정 파일을 읽는데 실패했습니다.\n오류: ' + error.message);
        }
    };
    
    reader.onerror = function() {
        alert('파일을 읽는데 실패했습니다.');
    };
    
    reader.readAsText(file);
}

// 현재 팝업 새로고침 (새 팝업을 열지 않고 내용만 업데이트)
function refreshCurrentPopup(template) {
    try {
        // 기존 이벤트 리스너 정리 (더 안전하게)
        template.find('*').off('click change input');
        
        // 특정 버튼들의 이벤트 리스너 명시적으로 제거
        template.find('#export-preset-btn, #export-all-settings-btn, #import-settings-btn').off('click');
        
        // 각 섹션을 안전하게 다시 렌더링
        if (typeof renderPresetDropdown === 'function') {
            renderPresetDropdown(template);
        }
        if (typeof renderToggleSection === 'function') {
            renderToggleSection(template);
        }
        if (typeof renderUIFontSection === 'function') {
            renderUIFontSection(template);
        }
        if (typeof renderMessageFontSection === 'function') {
            renderMessageFontSection(template);
        }
        if (typeof renderCustomTagSection === 'function') {
            renderCustomTagSection(template);
        }
        if (typeof renderMultiLanguageFontSection === 'function') {
            renderMultiLanguageFontSection(template);
        }
        if (typeof renderThemeLinkingSection === 'function') {
            renderThemeLinkingSection(template);
        }
        if (typeof renderFontAddArea === 'function') {
            renderFontAddArea(template);
        }
        if (typeof renderFontList === 'function') {
            renderFontList(template);
        }
        
        // 이벤트 리스너 재설정
        if (typeof setupEventListeners === 'function') {
            setupEventListeners(template);
        }
        
    } catch (error) {
        console.error('[Font Manager] 팝업 새로고침 중 오류:', error);
        // 오류 발생 시 최소한의 업데이트만 시도
        try {
            if (typeof renderPresetDropdown === 'function') {
                renderPresetDropdown(template);
            }
        } catch (fallbackError) {
            console.error('[Font Manager] 폴백 업데이트도 실패:', fallbackError);
        }
    }
}

// 전역 설정들의 충돌 없는 병합 처리
function mergeGlobalSettings(newSettings) {
    // 기본값 보장 (기존 설정을 덮어쓰지 않고 누락된 속성만 채움)
    Object.keys(defaultSettings).forEach(key => {
        if (!settings.hasOwnProperty(key)) {
            settings[key] = defaultSettings[key];
        }
    });
    
    // 1. 폰트 목록 병합 (중복 제거)
    if (newSettings.fonts && Array.isArray(newSettings.fonts)) {
        const existingFonts = settings.fonts || [];
        const existingFontNames = new Set(existingFonts.map(f => f.name));
        const newFonts = newSettings.fonts.filter(font => !existingFontNames.has(font.name));
        
                 console.log(`[Font Manager] 폰트 병합: 기존 ${existingFonts.length}개, 새로 추가 ${newFonts.length}개`);
         
         settings.fonts = [...existingFonts, ...newFonts];
    }
    
    // 2. 프리셋 목록 병합 (중복 제거)
    if (newSettings.presets && Array.isArray(newSettings.presets)) {
        const existingPresets = settings.presets || [];
        const existingPresetNames = new Set(existingPresets.map(p => p.name));
        const newPresets = newSettings.presets.filter(preset => !existingPresetNames.has(preset.name));
        
                 console.log(`[Font Manager] 프리셋 병합: 기존 ${existingPresets.length}개, 새로 추가 ${newPresets.length}개`);
         
         // ID 충돌 방지를 위해 새로운 ID 생성
         newPresets.forEach(preset => {
             if (existingPresets.some(p => p.id === preset.id)) {
                 preset.id = generateId();
             }
         });
         
         settings.presets = [...existingPresets, ...newPresets];
    }
    
    // 3. 테마 연동 규칙 병합 (중복 제거)
    if (newSettings.themeRules && Array.isArray(newSettings.themeRules)) {
        const existingThemeNames = new Set((settings.themeRules || []).map(r => r.themeName));
        const newThemeRules = newSettings.themeRules.filter(rule => !existingThemeNames.has(rule.themeName));
        
        // 프리셋 ID 매핑 (가져온 프리셋의 새로운 ID로 업데이트)
        newThemeRules.forEach(rule => {
            const oldPresetId = rule.presetId;
            const newPreset = settings.presets.find(p => 
                newSettings.presets && newSettings.presets.some(np => 
                    np.id === oldPresetId && np.name === p.name
                )
            );
            if (newPreset) {
                rule.presetId = newPreset.id;
            }
            
            // ID 충돌 방지
            if ((settings.themeRules || []).some(r => r.id === rule.id)) {
                rule.id = generateId();
            }
        });
        
        settings.themeRules = [...(settings.themeRules || []), ...newThemeRules];
        console.log(`[Font Manager] 테마 연동 병합: 기존 ${existingThemeNames.size}개, 새로 추가 ${newThemeRules.length}개`);
    }
    
        // 4. 확장 활성화 상태만 덮어쓰기 (다른 전역 설정들은 현재 상태 유지)
    if (newSettings.hasOwnProperty('enabled')) {
        settings.enabled = newSettings.enabled;
    }
    
    // 다른 전역 설정들(폰트, 크기 등)은 현재 프리셋과의 일관성을 위해 유지
    // 사용자가 원할 경우 수동으로 프리셋을 변경하여 적용 가능
}

// 불러오기 데이터 유효성 검사
function validateImportData(data) {
    try {
        // 기본 구조 확인
        if (!data || typeof data !== 'object') {
            console.warn('[Font Manager] 유효성 검사 실패: 데이터가 객체가 아님');
            return false;
        }
        
        if (!data.settings || typeof data.settings !== 'object') {
            console.warn('[Font Manager] 유효성 검사 실패: settings가 객체가 아님');
            return false;
        }
        
        const settings = data.settings;
        
                 // 버전 확인
         const version = data.version || "1.0";
        
        // 새로운 형식(v2.0)인 경우 추가 검증
        if (version === "2.0") {
            // currentPreset 정보가 있는 경우 검증
            if (data.currentPreset) {
                if (!data.currentPreset.selectedPresetId || !data.currentPreset.selectedPresetName) {
                    console.warn('[Font Manager] v2.0 형식: currentPreset 정보가 불완전함');
                    // 경고만 하고 계속 진행 (필수가 아님)
                }
            }
        }
        
        // 필수 속성들 확인 (배열이어야 함)
        const requiredArrays = ['fonts', 'presets'];
        for (const prop of requiredArrays) {
            if (!Array.isArray(settings[prop])) {
                console.warn(`[Font Manager] 유효성 검사 실패: ${prop}가 배열이 아님`);
                return false;
            }
        }
        
        // 선택적 배열들 확인 (있으면 배열이어야 함)
        const optionalArrays = ['themeRules'];
        for (const prop of optionalArrays) {
            if (settings[prop] && !Array.isArray(settings[prop])) {
                console.warn(`[Font Manager] 유효성 검사 실패: ${prop}가 배열이 아님`);
                return false;
            }
        }
        
        // 폰트 배열 유효성 검사
        if (settings.fonts && settings.fonts.length > 0) {
            for (const font of settings.fonts) {
                if (!font.id || !font.name || !font.type) {
                    console.warn('[Font Manager] 유효성 검사 실패: 폰트 객체가 필수 속성을 누락');
                    return false;
                }
            }
        }
        
        // 프리셋 배열 유효성 검사
        if (settings.presets && settings.presets.length > 0) {
            for (const preset of settings.presets) {
                if (!preset.id || !preset.name) {
                    console.warn('[Font Manager] 유효성 검사 실패: 프리셋 객체가 필수 속성을 누락');
                    return false;
                }
            }
        }
        
        // 테마 연동 규칙 유효성 검사 (있는 경우)
        if (settings.themeRules && settings.themeRules.length > 0) {
            for (const rule of settings.themeRules) {
                if (!rule.id || !rule.themeName || !rule.presetId) {
                    console.warn('[Font Manager] 유효성 검사 실패: 테마 연동 규칙이 필수 속성을 누락');
                    return false;
                }
            }
        }
        
                 return true;
        
    } catch (error) {
        console.error('[Font Manager] 유효성 검사 중 오류:', error);
        return false;
    }
}

// 설정 초기화
function resetSettings(template) {
    try {
        // 심각한 경고 메시지와 함께 확인 팝업
        const confirmation = confirm(
            '⚠️ 경고: 모든 폰트 매니저 설정이 초기화됩니다!\n\n' +
            '다음 항목들이 모두 삭제됩니다:\n' +
            '• 불러온 모든 폰트\n' +
            '• 저장된 모든 프리셋\n' +
            '• 테마 연동 설정\n' +
            '• 모든 폰트 및 크기 설정\n\n' +
            '이 작업은 되돌릴 수 없습니다.\n' +
            '계속하기 전에 현재 설정을 내보내기하여 백업하는 것을 권장합니다.\n\n' +
            '정말로 모든 설정을 초기화하시겠습니까?'
        );
        
        if (!confirmation) {
            return;
        }
        
        // 두 번째 확인
        const finalConfirmation = confirm(
            '마지막 확인: 정말로 모든 설정을 삭제하고 초기화하시겠습니까?\n\n' +
            '이 작업은 되돌릴 수 없습니다!'
        );
        
        if (!finalConfirmation) {
            return;
        }
        
        // localStorage에서 설정 완전 삭제
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        
        // 폰트 스타일 완전 제거
        if (fontStyle) {
            fontStyle.remove();
            fontStyle = null;
        }
        
        // 전역 변수들 초기화
        selectedPresetId = null;
        tempUiFont = null;
        tempMessageFont = null;
        originalUIStyles = null;
        isUIFontExplicitlyDefault = false;
        isMessageFontExplicitlyDefault = false;
        tempMultiLanguageEnabled = null;
        tempLanguageFonts = null;
        tempUiFontSize = null;
        tempUiFontWeight = null;
        tempChatFontSize = null;
        tempInputFontSize = null;
        tempChatFontWeight = null;
        tempChatLineHeight = null;
        
        // 설정을 기본값으로 완전 초기화
        settings = { ...defaultSettings };
        
        // 기본 프리셋 생성
        const defaultPreset = {
            id: generateId(),
            name: "default",
            uiFont: null,
            messageFont: null,
            multiLanguageEnabled: false,
            languageFonts: {
                english: null,
                korean: null,
                japanese: null,
                chinese: null
            },
            uiFontSize: 14,
            uiFontWeight: 0,
            chatFontSize: 14,
            inputFontSize: 14,
            chatFontWeight: 0,
            chatLineHeight: 1.2,
            customTags: []
        };
        settings.presets = [defaultPreset];
        settings.currentPreset = defaultPreset.id;
        
        // 새로운 설정 저장
        saveSettings();
        
        // UI 업데이트 (안전한 방식으로)
        setTimeout(() => {
            refreshCurrentPopup(template);
            alert('✅ 모든 설정이 성공적으로 초기화되었습니다!\n\n폰트 매니저가 기본 상태로 되돌아갔습니다.');
        }, 100);
        
    } catch (error) {
        console.error('[Font Manager] 설정 초기화 실패:', error);
        alert('❌ 설정 초기화에 실패했습니다.\n\n오류: ' + error.message + '\n\n페이지를 새로고침하고 다시 시도해주세요.');
    }
}



// 확장 초기화
jQuery(async () => {
    initSettings();
    
    await addToWandMenu();
    updateAllFonts();
    
    // SillyTavern 로드 완료 후 슬래시 커맨드 등록
    setTimeout(registerSlashCommands, 2000);
}); 