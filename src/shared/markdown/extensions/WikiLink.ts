import { Mark, markInputRule } from '@tiptap/core';

type DomElement = { getAttribute?: (name: string) => string | null };

export const WikiLink = Mark.create({
  name: 'wikiLink',

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (el: DomElement) => el?.getAttribute?.('data-title') ?? null,
        renderHTML: (attrs) => {
          if (!attrs.title) return {};
          return { 'data-title': attrs.title as string };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-wikilink': '',
        class: 'wikilink cursor-pointer text-blue-600 underline decoration-dotted hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
      },
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+?)(?:\|([^\]]+))?\]\]$/,
        type: this.type,
        getAttributes: (match) => {
          const display = match[2]?.trim() ?? match[1]?.trim() ?? '';
          return { title: display };
        },
      }),
    ];
  },
});
